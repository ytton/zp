const chalk = require('chalk');
const cliProgress = require('cli-progress');

/**
 * Display scan results in a formatted table
 */
function displayScanResults(archiveFiles) {
  if (archiveFiles.length === 0) {
    console.log(chalk.yellow('⚠️  No archive files found'));
    return;
  }

  console.log(chalk.green(`✓ Found ${archiveFiles.length} archive file${archiveFiles.length > 1 ? 's' : ''}`));
  console.log('');

  // Calculate column widths
  const nameWidth = Math.min(Math.max(...archiveFiles.map(f => getDisplayName(f).length), 10), 30);
  const formatWidth = 12;
  const sizeWidth = 10;
  const pathWidth = Math.min(Math.max(...archiveFiles.map(f => f.directory.length), 8), 25);

  // Table header
  const headerRow = 
    '┌─' + '─'.repeat(nameWidth + 2) + 
    '┬─' + '─'.repeat(formatWidth) + 
    '┬─' + '─'.repeat(sizeWidth) + 
    '┬─' + '─'.repeat(pathWidth + 2) + '┐';
  
  const headerContent =
    '│ ' + chalk.bold('File Name').padEnd(nameWidth) + 
    ' │ ' + chalk.bold('Format').padEnd(formatWidth - 1) +
    ' │ ' + chalk.bold('Size').padEnd(sizeWidth - 1) +
    ' │ ' + chalk.bold('Path').padEnd(pathWidth) + ' │';

  const separatorRow = 
    '├─' + '─'.repeat(nameWidth + 2) + 
    '┼─' + '─'.repeat(formatWidth) + 
    '┼─' + '─'.repeat(sizeWidth) + 
    '┼─' + '─'.repeat(pathWidth + 2) + '┤';

  console.log(headerRow);
  console.log(headerContent);
  console.log(separatorRow);

  // Table rows
  archiveFiles.forEach(file => {
    const displayInfo = getDisplayInfo(file);
    
    const name = truncateString(displayInfo.displayName, nameWidth);
    const format = truncateString(displayInfo.displayFormat, formatWidth - 1);
    const size = truncateString(displayInfo.size, sizeWidth - 1);
    const filePath = truncateString(displayInfo.path, pathWidth);
    
    const row = 
      '│ ' + formatFileIcon(file) + name + ' '.repeat(Math.max(0, nameWidth - name.length - 1)) +
      ' │ ' + format + ' '.repeat(Math.max(0, formatWidth - 1 - format.length)) +
      ' │ ' + size + ' '.repeat(Math.max(0, sizeWidth - 1 - size.length)) +
      ' │ ' + filePath + ' '.repeat(Math.max(0, pathWidth - filePath.length)) + ' │';
    
    console.log(row);
  });

  // Table footer
  const footerRow = 
    '└─' + '─'.repeat(nameWidth + 2) + 
    '┴─' + '─'.repeat(formatWidth) + 
    '┴─' + '─'.repeat(sizeWidth) + 
    '┴─' + '─'.repeat(pathWidth + 2) + '┘';
  
  console.log(footerRow);
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
      ...options
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
      console.log(chalk.gray(`├─ 🔐 Trying password: ${maskedPassword} (${attemptNum}/${totalAttempts})`));
    }
  }

  showProgress(percentage) {
    if (!this.options.showProgress) return;

    if (!this.progressBar) {
      this.progressBar = new cliProgress.SingleBar({
        format: chalk.gray('├─ ⏳ Extracting... ') + chalk.cyan('[{bar}]') + chalk.gray(' {percentage}%'),
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: false
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
        const nestedSuccess = result.nestedArchives.filter(n => n.success).length;
        const nestedTotal = result.nestedArchives.length;
        console.log(chalk.gray(`   └─ Nested archives: ${nestedSuccess}/${nestedTotal} successful`));
        
        // Show detailed nested statistics if available
        if (result.nestedStatistics && result.nestedStatistics.totalProcessed > 0) {
          const stats = result.nestedStatistics;
          console.log(chalk.gray(`      └─ Stats: ${stats.totalProcessed} processed, max depth: ${stats.maxDepthReached}`));
          
          if (stats.cyclesDetected > 0) {
            console.log(chalk.yellow(`      └─ Warning: ${stats.cyclesDetected} cycles detected and skipped`));
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
  console.log(chalk.cyan('📊 Extraction Summary'));
  
  const summaryBox = [
    '┌────────────────────────────────────────┐',
    `│ Total Archives: ${String(summary.totalFiles).padStart(2)}                     │`,
    `│ ${chalk.green('✓ Successful:')} ${String(summary.successCount).padStart(2)}                      │`,
    `│ ${chalk.red('✗ Failed:')} ${String(summary.failedCount).padStart(2)}                          │`,
    `│ ${chalk.blue('📁 Output Directory:')} ${truncateString(outputDir, 14).padEnd(14)} │`,
    `│ ${chalk.gray('⏱️  Total Time:')} ${String(summary.totalTime).padStart(5)}s               │`,
    '└────────────────────────────────────────┘'
  ];

  summaryBox.forEach(line => console.log(line));
  console.log('');

  // Show failed files if any
  if (summary.failedFiles.length > 0) {
    console.log(chalk.red('Failed files:'));
    summary.failedFiles.forEach(file => {
      console.log(chalk.red(`• ${file.fileName} - ${file.reason}`));
    });
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

  const inquirer = require('inquirer');
  
  console.log(chalk.yellow(`❓ Delete ${successfulFiles.length} successfully extracted archive(s)?`));
  
  const { shouldDelete } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldDelete',
      message: 'Delete original archive files?',
      default: false
    }
  ]);

  return shouldDelete;
}

/**
 * Helper functions
 */
function getDisplayName(archiveFile) {
  if (archiveFile.isVolume && archiveFile.volumeGroup) {
    const baseName = archiveFile.volumeReport?.details?.baseName || 
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
  const { getArchiveDisplayInfo } = require('../utils/fileScanner');
  return getArchiveDisplayInfo(archiveFile);
}

function formatFileIcon(archiveFile) {
  if (archiveFile.isVolume) {
    // Show different icons based on volume status
    if (archiveFile.volumeReport) {
      if (archiveFile.volumeReport.status === 'complete') {
        return '📦 '; // Complete volume set
      } else if (archiveFile.volumeReport.status === 'incomplete') {
        return '⚠️ '; // Incomplete volume set
      } else {
        return '❌ '; // Error in volume set
      }
    }
    return '📦 '; // Default volume icon
  } else if (archiveFile.extension !== '.zip' && archiveFile.extension !== '.rar' && archiveFile.extension !== '.7z') {
    return '🎭 '; // Disguised file
  }
  return '📦 ';
}

function truncateString(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

module.exports = {
  displayScanResults,
  ExtractionProgressDisplay,
  displayExtractionSummary,
  askDeleteConfirmation
};