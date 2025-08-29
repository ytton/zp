import chalk from 'chalk';
import cliProgress from 'cli-progress';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import path from 'path';
import { getArchiveInfo } from '../core/sevenZip.js';

/**
 * Display scan results in a formatted table
 */
async function displayScanResults(archiveFiles) {
  if (archiveFiles.length === 0) {
    console.log(chalk.yellow('⚠️  未找到压缩文件'));
    return;
  }

  // 获取每个文件的详细信息
  const filesWithInfo = await Promise.all(
    archiveFiles.map(async (file) => {
      try {
        const info = await getArchiveInfo(file.filePath);
        return { ...file, archiveInfo: info };
      } catch (err) {
        return { ...file, archiveInfo: null };
      }
    })
  );

  // 分组处理分卷文件
  const groupedFiles = groupVolumeFiles(filesWithInfo);

  console.log(
    chalk.green(
      `✓ 发现 ${archiveFiles.length} 个压缩文件 (${groupedFiles.length} 组)`
    )
  );
  console.log('');

  // Create table with cli-table3
  const table = new Table({
    head: [
      chalk.bold('File Name'),
      chalk.bold('Format'),
      chalk.bold('Size')
    ],
    colWidths: [50, 15, 12],
    style: {
      head: ['cyan'],
      border: ['gray']
    }
  });

  // Add rows to table
  groupedFiles.forEach(fileGroup => {
    const displayInfo = getDisplayInfo(fileGroup);
    const icon = formatFileIcon(fileGroup);

    table.push([
      icon + displayInfo.displayName,
      displayInfo.displayFormat,
      displayInfo.size
    ]);
  });

  console.log(table.toString());
  console.log('');
}

/**
 * Display extraction progress for a single archive
 */
class ExtractionProgressDisplay {
  constructor(archiveFile, options = {}) {
    this.archiveFile = archiveFile;
    this.options = {
      showPassword: true,
      showProgress: true,
      showNested: true,
      ...options,
    };
    this.currentStep = 0;
    this.totalSteps = 0;
    this.progressBar = null;
    this.startTime = Date.now();
  }

  start() {
    const displayName = getDisplayName(this.archiveFile);
    console.log(chalk.cyan(`📦 ${displayName}`));

    // Show volume status information if available
    if (this.archiveFile.isVolume && this.archiveFile.volumeReport) {
      const report = this.archiveFile.volumeReport;
      if (report.status === 'incomplete') {
        console.log(chalk.yellow(`├─ ⚠️ Volume Warning: ${report.message}`));
        if (report.missingFiles && report.missingFiles.length > 0) {
          report.missingFiles.forEach(file => {
            console.log(chalk.gray(`│  └─ Missing: ${file}`));
          });
        }
      } else if (report.status === 'complete') {
        console.log(chalk.green(`├─ ✓ Complete volume set: ${report.message}`));
      }
    }
  }

  showPasswordAttempt(maskedPassword, attemptNum, totalAttempts) {
    if (!this.options.showPassword) return;

    if (maskedPassword === '(no password)') {
      console.log(chalk.gray('├─ 🔓 No password protection'));
    } else {
      console.log(
        chalk.gray(
          `├─ 🔐 Trying password: ${maskedPassword} (${attemptNum}/${totalAttempts})`
        )
      );
    }
  }

  showProgress(percentage) {
    if (!this.options.showProgress) return;

    if (!this.progressBar) {
      this.progressBar = new cliProgress.SingleBar({
        format:
          chalk.gray('├─ ⏳ Extracting... ') +
          chalk.cyan('[{bar}]') +
          chalk.gray(' {percentage}%'),
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false,
      });
      this.progressBar.start(100, 0);
    }

    this.progressBar.update(percentage);

    if (percentage >= 100) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

  showNestedArchive(nestedArchive) {
    if (!this.options.showNested) return;

    const nestedName = getDisplayName(nestedArchive);
    console.log(chalk.gray(`├─ 🔄 Found nested archive: ${nestedName}`));
  }

  complete(result) {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    if (result.success) {
      console.log(chalk.green(`└─ ✓ Extraction successful (${duration}s)`));

      if (result.nestedArchives && result.nestedArchives.length > 0) {
        const nestedSuccess = result.nestedArchives.filter(
          n => n.success
        ).length;
        const nestedTotal = result.nestedArchives.length;
        console.log(
          chalk.gray(
            `   └─ Nested archives: ${nestedSuccess}/${nestedTotal} successful`
          )
        );

        // Show detailed nested statistics if available
        if (
          result.nestedStatistics &&
          result.nestedStatistics.totalProcessed > 0
        ) {
          const stats = result.nestedStatistics;
          console.log(
            chalk.gray(
              `      └─ Stats: ${stats.totalProcessed} processed, max depth: ${stats.maxDepthReached}`
            )
          );

          if (stats.cyclesDetected > 0) {
            console.log(
              chalk.yellow(
                `      └─ Warning: ${stats.cyclesDetected} cycles detected and skipped`
              )
            );
          }
        }
      }
    } else {
      console.log(chalk.red(`└─ ✗ Extraction failed: ${result.error}`));
    }
    console.log('');
  }
}

/**
 * Display final extraction summary
 */
function displayExtractionSummary(summary, outputDir) {
  console.log(chalk.cyan('📊 解压完成统计'));
  console.log('');

  // Create summary table
  const table = new Table({
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  });

  table.push(
    [chalk.bold('总计'), `${summary.totalFiles} 个文件`],
    [chalk.green('✓ 成功'), String(summary.successCount)],
    [chalk.red('✗ 失败'), String(summary.failedCount)],
    [chalk.blue('→ 输出目录'), truncateString(outputDir, 40)],
    [chalk.gray('⏱ 总耗时'), `${summary.totalTime}s`]
  );

  console.log(table.toString());
  console.log('');

  // Show failed files if any
  if (summary.failedFiles && summary.failedFiles.length > 0) {
    console.log(chalk.red('Failed files:'));

    const failedTable = new Table({
      head: [chalk.bold('File'), chalk.bold('Reason')],
      colWidths: [40, 40],
      style: {
        head: ['red'],
        border: ['gray'],
      },
    });

    summary.failedFiles.forEach(file => {
      failedTable.push([file.fileName, file.reason]);
    });

    console.log(failedTable.toString());
    console.log('');
  }
}

/**
 * Ask user for file deletion confirmation
 */
async function askDeleteConfirmation(successfulFiles) {
  if (successfulFiles.length === 0) {
    return false;
  }

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: `是否删除 ${successfulFiles.length} 个已成功解压的压缩文件?`,
      choices: [
        { name: '否，保留原始文件', value: false },
        { name: '是，删除原始文件', value: true },
      ],
      default: 0,
    },
  ]);

  return choice;
}

/**
 * Helper functions
 */
function getDisplayName(archiveFile) {
  if (archiveFile.isVolume && archiveFile.volumeGroup) {
    const baseName =
      archiveFile.volumeReport?.details?.baseName ||
      archiveFile.fileName.replace(/\.(001|002|003|004|005)$/i, '');

    let statusIcon = '';
    if (archiveFile.volumeReport) {
      statusIcon = archiveFile.volumeReport.status === 'complete' ? '✓' : '⚠';
    }

    return `${baseName} [${archiveFile.volumeGroup.length} volumes${statusIcon ? ' ' + statusIcon : ''}]`;
  }
  return archiveFile.fileName;
}

function getDisplayInfo(archiveFile) {
  // Format file size
  const formatSize = bytes => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get display format
  const getDisplayFormat = file => {
    // 使用 archiveInfo 中的格式信息
    let format = 'UNKNOWN';
    if (file.archiveInfo && file.archiveInfo.format) {
      format = file.archiveInfo.format;
    }

    // 添加标记
    const tags = [];

    // 检查是否是伪装文件：文件扩展名不是压缩格式
    const ext = file.extension.toLowerCase();
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.cab', '.dmg'];
    if (!archiveExts.includes(ext) && !isMultiPartFile(file.fileName)) {
      tags.push(chalk.gray('[伪装]'));
    }

    // 检查是否是分卷文件
    if (file.isVolume || isMultiPartFile(file.fileName) || file.volumeFiles) {
      tags.push(chalk.gray('[分卷]'));
    }

    return format + (tags.length > 0 ? ' ' + tags.join(' ') : '');
  };

  // 获取显示名称
  const getDisplayNameWithVolumes = (file) => {
    let name = '';

    if (file.volumeFiles && file.volumeFiles.length > 1) {
      const baseName = getVolumeBaseName(file.fileName);
      const firstNum = getVolumeNumber(file.volumeFiles[0]);
      const lastNum = getVolumeNumber(file.volumeFiles[file.volumeFiles.length - 1]);
      name = `${baseName}.${firstNum}-${lastNum}`;
    } else {
      name = file.fileName;
    }

    // 添加需密码标记
    if (file.archiveInfo && file.archiveInfo.requiresPassword) {
      name += ' ' + chalk.yellow('[需密码]');
    }

    return name;
  };

  // 处理分卷文件组
  if (archiveFile.volumeGroup) {
    const totalSize = archiveFile.volumeGroup.reduce((sum, f) => sum + (f.fileSize || 0), 0);
    return {
      displayName: truncateString(archiveFile.displayName || getDisplayName(archiveFile), 30),
      displayFormat: getDisplayFormat(archiveFile.volumeGroup[0]),
      size: formatSize(totalSize),
      path: archiveFile.volumeGroup[0].directory || path.dirname(archiveFile.volumeGroup[0].filePath) || '',
    };
  }

  return {
    displayName: truncateString(getDisplayNameWithVolumes(archiveFile), 30),
    displayFormat: getDisplayFormat(archiveFile),
    size: formatSize(archiveFile.fileSize || 0),
    path: archiveFile.directory || path.dirname(archiveFile.filePath) || '',
  };
}

function formatFileIcon(archiveFile) {
  if (archiveFile.isVolume) {
    // Show different icons based on volume status
    if (archiveFile.volumeReport) {
      if (archiveFile.volumeReport.status === 'complete') {
        return '📦 '; // Complete volume set
      } else if (archiveFile.volumeReport.status === 'incomplete') {
        return '⚠️  '; // Incomplete volume set
      } else {
        return '❌ '; // Error in volume set
      }
    }
    return '📦 '; // Default volume icon
  } else if (isMultiPartFile(archiveFile.fileName)) {
    // 单个分卷文件也使用普通压缩包图标
    return '📦 ';
  } else if (
    archiveFile.extension !== '.zip' &&
    archiveFile.extension !== '.rar' &&
    archiveFile.extension !== '.7z'
  ) {
    return '🎭 '; // Disguised file
  }
  return '📦 ';
}

function truncateString(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * 判断是否是分卷文件
 */
function isMultiPartFile(fileName) {
  const name = fileName.toLowerCase();
  return (
    /\.part\d+\.rar$/i.test(name) ||  // file.part01.rar
    /\.part\d+$/i.test(name) ||       // file.part01
    /\.\d{3}$/i.test(name) ||         // file.001
    /\.z\d{2}$/i.test(name) ||        // file.z01
    /\.r\d{2}$/i.test(name)           // file.r01
  );
}


/**
 * 分组分卷文件
 */
function groupVolumeFiles(files) {
  const groups = [];
  const processed = new Set();

  files.forEach(file => {
    if (processed.has(file.filePath)) return;

    if (isMultiPartFile(file.fileName)) {
      // 查找同组的分卷文件
      const volumeGroup = findVolumeGroup(file, files);

      if (volumeGroup.length > 1) {
        // 创建分卷组
        const baseName = getVolumeBaseName(volumeGroup[0].fileName);
        const firstFile = volumeGroup[0];
        const lastFile = volumeGroup[volumeGroup.length - 1];

        // 获取分卷编号范围
        const firstNum = getVolumeNumber(firstFile.fileName);
        const lastNum = getVolumeNumber(lastFile.fileName);

        groups.push({
          ...firstFile,
          volumeGroup: volumeGroup,
          displayName: `${baseName}${firstNum}-${lastNum}`,
          isVolume: true
        });

        // 标记所有分卷文件为已处理
        volumeGroup.forEach(f => processed.add(f.filePath));
      } else {
        // 单个分卷文件
        groups.push(file);
        processed.add(file.filePath);
      }
    } else {
      // 非分卷文件
      groups.push(file);
      processed.add(file.filePath);
    }
  });

  return groups;
}

/**
 * 查找同组的分卷文件
 */
function findVolumeGroup(file, allFiles) {
  const baseName = getVolumeBaseName(file.fileName);
  const dir = path.dirname(file.filePath);

  return allFiles
    .filter(f => {
      if (path.dirname(f.filePath) !== dir) return false;
      const fBaseName = getVolumeBaseName(f.fileName);
      return fBaseName === baseName;
    })
    .sort((a, b) => {
      const numA = getVolumeNumber(a.fileName);
      const numB = getVolumeNumber(b.fileName);
      return numA - numB;
    });
}

/**
 * 获取分卷文件的基础名称
 */
function getVolumeBaseName(fileName) {
  return fileName
    .replace(/\.part\d+\.rar$/i, '')
    .replace(/\.part\d+$/i, '')
    .replace(/\.\d{3}$/i, '')
    .replace(/\.z\d{2}$/i, '')
    .replace(/\.r\d{2}$/i, '');
}

/**
 * 获取分卷编号
 */
function getVolumeNumber(fileName) {
  let match;

  if ((match = fileName.match(/\.part(\d+)\.rar$/i))) {
    return match[1].padStart(3, '0');
  } else if ((match = fileName.match(/\.part(\d+)$/i))) {
    return match[1].padStart(3, '0');
  } else if ((match = fileName.match(/\.(\d{3})$/i))) {
    return match[1];
  } else if ((match = fileName.match(/\.z(\d{2})$/i))) {
    return '0' + match[1];
  } else if ((match = fileName.match(/\.r(\d{2})$/i))) {
    return '0' + match[1];
  }

  return '001';
}

export {
  displayScanResults,
  ExtractionProgressDisplay,
  displayExtractionSummary,
  askDeleteConfirmation,
};
