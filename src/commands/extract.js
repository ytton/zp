const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ZPError } = require('../core/errors');
const { scanForArchives } = require('../utils/fileScanner');
const { ArchiveExtractor } = require('../core/extractor');
const { 
  displayScanResults, 
  ExtractionProgressDisplay, 
  displayExtractionSummary,
  askDeleteConfirmation 
} = require('../ui/display');

/**
 * Main extraction command handler
 */
async function extractCommand(scanPath, options) {
  try {
    console.log(chalk.cyan('🔍 Initializing ZP extraction tool...'));
    
    // Validate and normalize options
    const config = validateAndNormalizeOptions(scanPath, options);
    displayConfiguration(config);

    // Step 1: Scan for archive files
    console.log(chalk.blue('🔍 Scanning for archive files...'));
    const archiveFiles = await scanForArchives(config.scanPath, {
      recursive: config.recursive,
      includeHidden: false,
      maxDepth: 10
    });

    // Step 2: Display scan results
    displayScanResults(archiveFiles);

    // Step 3: Create output directory
    if (!fs.existsSync(config.destination)) {
      fs.mkdirSync(config.destination, { recursive: true });
    }

    // Step 4: Extract archives
    console.log(chalk.blue('🚀 Starting extraction process...'));
    const results = await extractArchives(archiveFiles, config);

    // Step 5: Display results
    const summary = generateExtractionSummary(results);
    displayExtractionSummary(summary, config.destination);

    // Step 6: Handle file cleanup
    await handleFileCleanup(results, config);

    console.log(chalk.green('🎉 Extraction process completed!'));
    
  } catch (error) {
    if (error instanceof ZPError) {
      console.error(chalk.red('❌ Error:'), error.getUserMessage());
    } else {
      console.error(chalk.red('❌ Unexpected error:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

/**
 * Validate and normalize command options
 */
function validateAndNormalizeOptions(scanPath, options) {
  if (!scanPath) {
    throw new Error('Scan path is required');
  }
  
  // Convert relative path to absolute
  const absoluteScanPath = path.resolve(scanPath);
  const absoluteDestination = path.resolve(options.destination || '.');
  
  // Ensure passwords is an array
  const passwords = Array.isArray(options.password) ? options.password : 
                   options.password ? [options.password] : [];
  
  return {
    scanPath: absoluteScanPath,
    destination: absoluteDestination,
    passwords,
    recursive: options.recursive !== false,
    keep: options.keep || false,
    verbose: options.verbose || false,
    detectMerged: options.detectMerged || false,
    keepCarrier: options.keepCarrier || false,
    noColor: options.noColor || false
  };
}

/**
 * Display current configuration
 */
function displayConfiguration(config) {
  console.log(chalk.blue('📋 Configuration:'));
  console.log(`   Scan Path: ${config.scanPath}`);
  console.log(`   Output Directory: ${config.destination}`);
  console.log(`   Passwords: ${config.passwords.length} specified`);
  console.log(`   Recursive Extraction: ${config.recursive ? 'enabled' : 'disabled'}`);
  console.log(`   Keep Original Files: ${config.keep ? 'yes' : 'prompt user'}`);
  
  if (config.detectMerged) {
    console.log(`   Merged File Detection: ${chalk.yellow('enabled')}`);
  }
  
  if (config.keepCarrier) {
    console.log(`   Keep Carrier Files: ${chalk.yellow('yes')}`);
  }
  
  if (config.verbose) {
    console.log(`   Verbose Output: ${chalk.yellow('enabled')}`);
  }
  
  console.log('');
}

/**
 * Extract all archives with progress display
 */
async function extractArchives(archiveFiles, config) {
  const results = [];
  const extractor = new ArchiveExtractor({
    handleNested: config.recursive,
    onProgress: null, // Will be set per archive
    onPasswordAttempt: null, // Will be set per archive  
    onNestedFound: null // Will be set per archive
  });

  for (let i = 0; i < archiveFiles.length; i++) {
    const archiveFile = archiveFiles[i];
    const progressDisplay = new ExtractionProgressDisplay(archiveFile, {
      showPassword: true,
      showProgress: true,
      showNested: config.recursive
    });

    // Set up callbacks for this specific archive
    extractor.options.onProgress = (percentage) => {
      progressDisplay.showProgress(percentage);
    };
    
    extractor.options.onPasswordAttempt = (maskedPassword, attemptNum, totalAttempts) => {
      progressDisplay.showPasswordAttempt(maskedPassword, attemptNum, totalAttempts);
    };
    
    extractor.options.onNestedFound = (nestedArchive) => {
      progressDisplay.showNestedArchive(nestedArchive);
    };

    // Start extraction
    progressDisplay.start();
    
    // Debug: log the parameters being passed
    if (config.verbose) {
      console.log(chalk.gray(`   Debug - archiveFile.filePath: ${archiveFile.filePath}`));
      console.log(chalk.gray(`   Debug - destination: ${config.destination}`));
      console.log(chalk.gray(`   Debug - passwords: ${JSON.stringify(config.passwords)}`));
    }
    
    const result = await extractor.extractArchive(
      archiveFile, 
      config.destination, 
      config.passwords
    );
    
    // Debug output to see what's happening
    if (config.verbose) {
      console.log(chalk.gray(`   Debug - Result success: ${result.success}, error: ${result.error}`));
    }
    
    results.push(result);
    progressDisplay.complete(result);
    
    if (!result.success && config.verbose) {
      console.error(chalk.gray(`   Error details: ${result.error}`));
    }
  }

  return results;
}

/**
 * Generate extraction summary
 */
function generateExtractionSummary(results) {
  const extractor = new ArchiveExtractor();
  return extractor.generateSummary(results);
}

/**
 * Handle file cleanup (deletion of successfully extracted archives)
 */
async function handleFileCleanup(results, config) {
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length === 0) {
    return;
  }

  let shouldDelete = config.keep === true ? false : true;
  
  // If not keeping files and not explicitly requested to keep, ask user
  if (!config.keep) {
    shouldDelete = await askDeleteConfirmation(successfulResults);
  }

  if (shouldDelete) {
    console.log(chalk.yellow('🗑️  Deleting successfully extracted archives...'));
    
    let deletedCount = 0;
    for (const result of successfulResults) {
      try {
        fs.unlinkSync(result.archiveFile.filePath);
        deletedCount++;
        
        if (config.verbose) {
          console.log(chalk.gray(`   Deleted: ${result.archiveFile.fileName}`));
        }
      } catch (error) {
        console.warn(chalk.yellow(`   Warning: Could not delete ${result.archiveFile.fileName}: ${error.message}`));
      }
    }
    
    console.log(chalk.green(`✓ Deleted ${deletedCount} archive file(s)`));
  } else {
    console.log(chalk.blue('📁 Original archive files preserved'));
  }
}

module.exports = extractCommand;