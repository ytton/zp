import { promises as fs } from 'fs';
import path from 'path';
import { extractArchive, isArchive } from './sevenZip.js';

/**
 * 扫描目录中的压缩包文件
 * 针对伪装文件场景优化，能智能判断是否到达真实内容
 * @param {string} dirPath - 要扫描的目录路径
 * @param {Object} options - 选项
 * @param {boolean} options.recursive - 是否递归扫描
 * @param {number} options.maxDepth - 最大递归深度
 * @param {number} options.nestingLevel - 当前嵌套层级（0=平面扫描，>0=压缩包内扫描）
 */
export async function scanForArchives(dirPath, options = {}) {
  const { recursive = true, maxDepth = 7, nestingLevel = 0 } = options;
  const archives = [];

  // 防止无限递归
  if (nestingLevel > maxDepth) {
    console.log(`达到最大扫描深度 ${maxDepth}，停止扫描: ${dirPath}`);
    return archives;
  }

  async function scanDir(currentDir, currentNestingLevel = 0) {
    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });

      // 只有在嵌套扫描时（nestingLevel >= 1）才判断真实内容
      if (currentNestingLevel >= 1) {
        const isRealContent = await checkIfRealContent(currentDir, items);

        if (isRealContent) {
          console.log(`[嵌套层级 ${currentNestingLevel}] 检测到真实内容目录，停止深度扫描: ${currentDir}`);
          return; // 不再递归子目录
        }
      }

      // 正常扫描逻辑
      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);

        if (item.isFile()) {
          if (await isArchive(fullPath)) {
            const stat = await fs.stat(fullPath);
            archives.push({
              fileName: item.name,
              filePath: fullPath,
              fileSize: stat.size,
              extension: path.extname(item.name).toLowerCase(),
              nestingLevel: currentNestingLevel
            });
          }
        } else if (item.isDirectory() && recursive) {
          await scanDir(fullPath, currentNestingLevel);
        }
      }
    } catch (err) {
      console.warn(`扫描目录失败 ${currentDir}: ${err.message}`);
    }
  }

  await scanDir(dirPath, nestingLevel);
  return archives;
}

/**
 * 简单判断是否到达真实内容
 * 逻辑：检查第一个文件（优先子目录中的文件）是否为压缩包
 * @param {string} currentDir - 当前目录路径
 * @param {Array} items - 目录项列表
 * @returns {boolean} 是否为真实内容
 */
async function checkIfRealContent(currentDir, items) {
  // 分离文件和目录
  const dirs = items.filter(item => item.isDirectory());
  const files = items.filter(item => item.isFile());

  // 如果有子目录，检查第一个子目录的第一个文件
  if (dirs.length > 0) {
    try {
      const firstDir = dirs[0];
      const subDirPath = path.join(currentDir, firstDir.name);
      const subItems = await fs.readdir(subDirPath, { withFileTypes: true });
      const subFiles = subItems.filter(item => item.isFile());

      if (subFiles.length > 0) {
        const firstFilePath = path.join(subDirPath, subFiles[0].name);
        const isFirstFileArchive = await isArchive(firstFilePath);
        return !isFirstFileArchive; // 如果第一个文件不是压缩包，说明到达真实内容
      }
    } catch (err) {
      // 忽略读取子目录失败的情况
    }
  }

  // 如果没有子目录或子目录检查失败，检查当前目录的第一个文件
  if (files.length > 0) {
    const firstFilePath = path.join(currentDir, files[0].name);
    const isFirstFileArchive = await isArchive(firstFilePath);
    return !isFirstFileArchive; // 如果第一个文件不是压缩包，说明到达真实内容
  }

  // 如果既没有子目录也没有文件，认为是真实内容（空目录）
  return true;
}


/**
 * 批量解压压缩包
 */
export async function extractArchives(archives, outputDir, passwords = [], options = {}) {
  const { onProgress, onArchiveStart, onArchiveComplete } = options;
  const results = [];

  await fs.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < archives.length; i++) {
    const archive = archives[i];

    if (onArchiveStart) {
      onArchiveStart(archive, i + 1, archives.length);
    }

    try {
      const archiveOutputDir = path.join(outputDir, path.parse(archive.fileName).name);

      // 尝试解压
      let extractResult = null;
      let usedPassword = null;

      // 先尝试无密码
      try {
        extractResult = await extractArchive(archive.filePath, archiveOutputDir);
      } catch (err) {
        // 如果是密码错误，尝试密码列表
        if (err.message.includes('密码错误') && passwords.length > 0) {
          for (const password of passwords) {
            try {
              extractResult = await extractArchive(archive.filePath, archiveOutputDir, password);
              usedPassword = password;
              break;
            } catch {
              continue;
            }
          }
        }
      }

      const result = {
        archive,
        success: !!extractResult,
        outputPath: extractResult ? archiveOutputDir : null,
        usedPassword,
        duration: extractResult ? extractResult.duration : 0,
        error: extractResult ? null : '解压失败',
      };

      results.push(result);

      if (onArchiveComplete) {
        onArchiveComplete(result, i + 1, archives.length);
      }

      // 处理嵌套压缩包
      if (extractResult && archiveOutputDir) {
        const nestedResults = await processNestedArchives(archiveOutputDir, passwords, {
          onNestedFound: options.onNestedFound,
        });
        result.nestedArchives = nestedResults;
      }

    } catch (err) {
      const result = {
        archive,
        success: false,
        outputPath: null,
        usedPassword: null,
        duration: 0,
        error: err.message,
      };

      results.push(result);

      if (onArchiveComplete) {
        onArchiveComplete(result, i + 1, archives.length);
      }
    }

    if (onProgress) {
      onProgress(Math.round(((i + 1) / archives.length) * 100));
    }
  }

  return results;
}

/**
 * 处理嵌套压缩包（递归）
 */
export async function processNestedArchives(extractedDir, passwords = [], options = {}, currentDepth = 0) {
  const { onNestedFound } = options;
  const results = [];

  try {
    // 传递 nestingLevel 参数，表示这是嵌套扫描
    const nestedArchives = await scanForArchives(extractedDir, {
      recursive: true,
      nestingLevel: currentDepth + 1  // 嵌套层级从1开始
    });

    if (nestedArchives.length === 0) {
      return results;
    }

    console.log(`第 ${currentDepth + 1} 层发现 ${nestedArchives.length} 个嵌套压缩包`);

    for (const nestedArchive of nestedArchives) {
      if (onNestedFound) {
        onNestedFound(nestedArchive, currentDepth + 1);
      }

      try {
        const nestedOutputDir = path.join(
          extractedDir,
          `${path.parse(nestedArchive.fileName).name}_extracted`
        );

        let extractResult = null;
        let usedPassword = null;

        // 尝试无密码解压
        try {
          extractResult = await extractArchive(nestedArchive.filePath, nestedOutputDir);
        } catch (err) {
          if (err.message.includes('密码错误') && passwords.length > 0) {
            for (const password of passwords) {
              try {
                extractResult = await extractArchive(nestedArchive.filePath, nestedOutputDir, password);
                usedPassword = password;
                break;
              } catch {
                continue;
              }
            }
          }
        }

        if (extractResult) {
          const result = {
            archive: nestedArchive,
            success: true,
            outputPath: nestedOutputDir,
            usedPassword,
            nestingLevel: currentDepth + 1,
          };

          // 递归处理更深层的嵌套压缩包
          const deeperResults = await processNestedArchives(
            nestedOutputDir,
            passwords,
            options,
            currentDepth + 1
          );

          if (deeperResults.length > 0) {
            result.nestedArchives = deeperResults;
          }

          results.push(result);

          // 删除已解压的嵌套压缩包
          try {
            await fs.unlink(nestedArchive.filePath);
            console.log(`清理第 ${currentDepth + 1} 层嵌套压缩包: ${nestedArchive.fileName}`);
          } catch {
            // 忽略删除失败
          }
        } else {
          results.push({
            archive: nestedArchive,
            success: false,
            error: '解压失败',
            nestingLevel: currentDepth + 1,
          });
        }
      } catch (err) {
        results.push({
          archive: nestedArchive,
          success: false,
          error: err.message,
          nestingLevel: currentDepth + 1,
        });
      }
    }
  } catch (err) {
    console.warn(`扫描第 ${currentDepth + 1} 层嵌套压缩包失败: ${err.message}`);
  }

  return results;
}

/**
 * 完整的压缩包处理流程
 */
export async function processArchives(scanDir, outputDir, passwords = [], options = {}) {
  console.log(`扫描压缩包: ${scanDir}`);
  const archives = await scanForArchives(scanDir);

  if (archives.length === 0) {
    console.log('未找到压缩包文件');
    return { archives: [], results: [] };
  }

  console.log(`找到 ${archives.length} 个压缩包文件`);
  const results = await extractArchives(archives, outputDir, passwords, options);

  return { archives, results };
}

// 默认导出
export default {
  scanForArchives,
  extractArchives,
  processNestedArchives,
  processArchives,
};
