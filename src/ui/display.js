import chalk from 'chalk';
import cliProgress from 'cli-progress';
import inquirer from 'inquirer';
import Table from 'cli-table3';

/**
 * Display scan results in a formatted table
 */
function displayScanResults(archiveFiles) {
  if (archiveFiles.length === 0) {
    console.log(chalk.yellow('⚠️  未找到压缩文件'));
    return;
  }

  console.log(
    chalk.green(
      `✓ 发现 ${archiveFiles.length} 个压缩文件`
    )
  );
  console.log('');

  // Create table with cli-table3
  const table = new Table({
    head: [
      chalk.bold('File Name'),
      chalk.bold('Format'),
      chalk.bold('Size'),
      chalk.bold('Path')
    ],
    colWidths: [35, 12, 12, 40],
    style: {
      head: ['cyan'],
      border: ['gray']
    }
  });

  // Add rows to table
  archiveFiles.forEach(file => {
    const displayInfo = getDisplayInfo(file);
    const icon = formatFileIcon(file);

    table.push([
      icon + displayInfo.displayName,
      displayInfo.displayFormat,
      displayInfo.size,
      displayInfo.path
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
      border: ['gray']
    }
  });

  table.push(
    [chalk.bold('总计'), `${summary.totalFiles} 个文件`],
    [chalk.green('✓ 成功'), String(summary.successCount)],
    [chalk.red('✗ 失败'), String(summary.failedCount)],
    [chalk.blue('📁 输出目录'), truncateString(outputDir, 40)],
    [chalk.gray('⏱️  总耗时'), `${summary.totalTime}s`]
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
        border: ['gray']
      }
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

  console.log(
    chalk.yellow(
      `❓ 是否删除 ${successfulFiles.length} 个已成功解压的压缩文件?`
    )
  );

  const { shouldDelete } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldDelete',
      message: `是否删除 ${successfulFiles.length} 个已成功解压的压缩文件?`,
      default: false,
    },
  ]);

  return shouldDelete;
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
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get display format
  const getDisplayFormat = (file) => {
    if (file.isVolume) {
      return 'Volume Set';
    }

    const ext = file.extension.toLowerCase();
    const formatMap = {
      '.zip': 'ZIP',
      '.rar': 'RAR',
      '.7z': '7-Zip',
      '.tar': 'TAR',
      '.gz': 'GZIP',
      '.bz2': 'BZIP2',
      '.xz': 'XZ',
      '.iso': 'ISO',
      '.cab': 'CAB',
      '.dmg': 'DMG'
    };

    return formatMap[ext] || ext.toUpperCase().substring(1);
  };

  return {
    displayName: truncateString(getDisplayName(archiveFile), 30),
    displayFormat: getDisplayFormat(archiveFile),
    size: formatSize(archiveFile.fileSize || 0),
    path: archiveFile.directory || archiveFile.filePath || ''
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

export {
  displayScanResults,
  ExtractionProgressDisplay,
  displayExtractionSummary,
  askDeleteConfirmation,
};
