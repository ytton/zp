import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
import { ZPError } from '../core/errors.js';
import {
  scanForArchives,
  extractArchives
} from '../core/archiveProcessor.js';
import { isArchive } from '../core/sevenZip.js';
import {
  displayScanResults,
  displayExtractionSummary,
  askDeleteConfirmation,
} from '../ui/display.js';
import { getAllPasswords } from '../utils/passwordStore.js';

/**
 * 主解压命令处理器
 */
async function extractCommand(scanPath, options) {
  try {
    // 验证和标准化选项
    const config = validateAndNormalizeOptions(scanPath, options);

    // 扫描压缩文件
    console.log(chalk.blue('🔍 正在扫描压缩文件...'));

    let archiveFiles = [];

    // 检查路径是文件还是目录
    const stats = await fs.stat(config.scanPath);

    if (stats.isFile()) {
      // 如果是文件，检查是否是压缩包
      if (await isArchive(config.scanPath)) {
        const fileStats = await fs.stat(config.scanPath);
        archiveFiles = [{
          fileName: path.basename(config.scanPath),
          filePath: config.scanPath,
          fileSize: fileStats.size,
          extension: path.extname(config.scanPath).toLowerCase(),
          nestingLevel: 0
        }];
      } else {
        console.log(chalk.yellow('指定的文件不是有效的压缩包'));
        return;
      }
    } else if (stats.isDirectory()) {
      // 如果是目录，扫描目录中的压缩包
      archiveFiles = await scanForArchives(config.scanPath, {
        recursive: config.recursive,
        maxDepth: 10,
        nestingLevel: 0
      });
    } else {
      console.log(chalk.yellow('指定的路径既不是文件也不是目录'));
      return;
    }

    if (archiveFiles.length === 0) {
      console.log(chalk.yellow('未找到压缩文件'));
      return;
    }


    // 显示扫描结果
    await displayScanResults(archiveFiles);

    // 如果是仅扫描模式，显示结果后直接返回
    if (config.scanOnly) {
      console.log(chalk.cyan('\n✓ 扫描完成'));
      return;
    }

    // 创建输出目录
    await fs.mkdir(config.destination, { recursive: true });

    // 获取所有密码（命令行 + 密码库）
    const allPasswords = await getAllPasswordsCombined(config.passwords);

    // 解压文件
    console.log(chalk.blue('⏱ 解压文件进度：'));

    const startTime = Date.now();
    const results = await extractAllArchives(archiveFiles, config, allPasswords);

    // 显示结果
    console.log('');
    const summary = generateExtractionSummary(results, startTime);
    displayExtractionSummary(summary, config.destination);

    // 处理文件清理
    await handleFileCleanup(results, config);

  } catch (error) {
    if (error instanceof ZPError) {
      console.error(chalk.red('❌ 错误:'), error.getUserMessage());
    } else {
      console.error(chalk.red('❌ 意外错误:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

/**
 * 验证和标准化命令选项
 */
function validateAndNormalizeOptions(scanPath, options) {
  if (!scanPath) {
    throw new Error('扫描路径是必需的');
  }

  // 转换为绝对路径
  const absoluteScanPath = path.resolve(scanPath);
  const absoluteDestination = path.resolve(options.destination || '.');

  // 确保密码是数组
  const passwords = Array.isArray(options.password)
    ? options.password
    : options.password
      ? [options.password]
      : [];

  return {
    scanPath: absoluteScanPath,
    destination: absoluteDestination,
    passwords,
    recursive: options.recursive !== false,
    keep: options.keep || false,
    scanOnly: options.scanOnly || false,
    verbose: options.verbose || false,
    detectMerged: options.detectMerged || false,
    keepCarrier: options.keepCarrier || false,
    noColor: options.noColor || false,
  };
}


/**
 * 获取所有密码（命令行 + 密码库）
 */
async function getAllPasswordsCombined(commandLinePasswords) {
  try {
    const storedPasswords = getAllPasswords();
    // 命令行密码优先，然后是存储的密码（按使用频率排序）
    const sortedStoredPasswords = storedPasswords
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .map(p => p.value);

    return [...commandLinePasswords, ...sortedStoredPasswords];
  } catch (error) {
    // 如果读取密码库失败，只使用命令行密码
    return commandLinePasswords;
  }
}

/**
 * 解压所有压缩文件
 */
async function extractAllArchives(archiveFiles, config, passwords) {
  // 使用 archiveProcessor 中的 extractArchives 函数
  const results = await extractArchives(archiveFiles, config.destination, passwords, {
    onProgress: (_progress) => {
      // 总体进度回调
    },
    onArchiveStart: (archive, _current, _total) => {
      // 每个压缩包开始时的回调
      console.log(chalk.blue(`\n📦 ${archive.fileName}`));
    },
    onArchiveComplete: (result, _current, _total) => {
      // 每个压缩包完成时的回调
      if (result.success) {
        // 显示解压成功信息
        console.log(chalk.gray(`├─ 解压${result.archive.fileName}成功`));

        // 如果有嵌套压缩包，显示嵌套包信息
        if (result.nestedArchives && result.nestedArchives.length > 0) {
          result.nestedArchives.forEach((nested) => {
            if (nested.success) {
              console.log(chalk.gray(`├─ 发现嵌套包[${nested.archive.fileName}]，解压[${nested.archive.fileName}]成功`));
            } else {
              console.log(chalk.red(`├─ 发现嵌套包[${nested.archive.fileName}]，解压[${nested.archive.fileName}]失败`));
            }
          });
          // 显示清理临时文件信息
          console.log(chalk.gray('├─ 清理嵌套临时文件'));
        }

        // 最后显示总体成功信息
        let successMsg = '└─ ✓ 解压成功';
        if (result.usedPassword) {
          successMsg += ` 🔐 ${result.usedPassword}`;
        }
        successMsg += ` (耗时: ${(result.duration || 0).toFixed(1)}s)`;
        console.log(chalk.green(successMsg));
      } else {
        // 解压失败的情况
        console.log(chalk.red(`├─ 解压${result.archive.fileName}失败`));
        if (result.error) {
          console.log(chalk.gray(`├─ 原因: ${result.error}`));
        }
        console.log(chalk.red('└─ ✗ 解压失败'));
      }
    },
    onNestedFound: (_nestedArchive, _depth) => {
      // 发现嵌套压缩包时的回调 - 简化输出，不显示
    }
  });

  return results;
}

/**
 * 生成解压摘要
 */
function generateExtractionSummary(results, startTime) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.length - successCount;

  const failedFiles = results
    .filter(r => !r.success)
    .map(r => ({
      fileName: r.archive.fileName,
      reason: r.error || '未知错误'
    }));

  return {
    totalFiles: results.length,
    successCount,
    failedCount,
    totalTime,
    failedFiles
  };
}

/**
 * 处理文件清理（删除成功解压的压缩包）
 */
async function handleFileCleanup(results, config) {
  const successfulResults = results.filter(r => r.success);

  if (successfulResults.length === 0) {
    return;
  }

  let shouldDelete = false;

  // 如果没有指定保留文件，询问用户
  if (!config.keep) {
    const successfulFiles = successfulResults.map(r => r.archive);
    shouldDelete = await askDeleteConfirmation(successfulFiles);
  }

  if (shouldDelete) {
    console.log(chalk.yellow('\n🗑️  正在删除已成功解压的压缩文件...'));

    let deletedCount = 0;
    for (const result of successfulResults) {
      try {
        await fs.unlink(result.archive.filePath);
        deletedCount++;
      } catch (error) {
        if (config.verbose) {
          console.warn(chalk.yellow(`警告: 无法删除 ${result.archive.fileName}`));
        }
      }
    }

    console.log(chalk.green(`✓ 已删除 ${deletedCount} 个压缩文件`));
  }
}

export default extractCommand;
