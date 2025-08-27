const path = require('path');
const fs = require('fs');
const { sevenZip } = require('./sevenZip');
const { getAllPasswords, updatePasswordUsage } = require('../utils/passwordStore');
const { ErrorFactory } = require('./errors');
const { VolumeHandler } = require('./volumeHandler');
const { NestedArchiveProcessor } = require('./nestedProcessor');

/**
 * Archive extraction result
 */
class ExtractionResult {
  constructor(archiveFile) {
    this.archiveFile = archiveFile;
    this.success = false;
    this.outputPath = null;
    this.extractedFiles = [];
    this.usedPassword = null;
    this.error = null;
    this.startTime = new Date();
    this.endTime = null;
    this.duration = 0;
    this.nestedArchives = [];
  }

  complete(success, outputPath = null, extractedFiles = [], error = null) {
    this.success = success;
    this.outputPath = outputPath;
    this.extractedFiles = extractedFiles || [];
    this.error = error;
    this.endTime = new Date();
    this.duration = (this.endTime - this.startTime) / 1000; // seconds
  }
}

/**
 * Archive extractor with password support and nested extraction
 */
class ArchiveExtractor {
  constructor(options = {}) {
    this.options = {
      maxPasswordAttempts: 10,
      preserveArchivePaths: true,
      handleNested: true,
      tempDir: this._getTempDir(),
      onProgress: null,
      onPasswordAttempt: null,
      onNestedFound: null,
      // Nested processing options
      maxNestingDepth: 5,
      maxTotalNestedArchives: 50,
      enableCycleDetection: true,
      nestedCleanupMode: 'success',
      ...options
    };
    
    // Initialize nested processor
    this.nestedProcessor = new NestedArchiveProcessor({
      maxDepth: this.options.maxNestingDepth,
      maxTotalArchives: this.options.maxTotalNestedArchives,
      enableCycleDetection: this.options.enableCycleDetection,
      cleanupMode: this.options.nestedCleanupMode,
      onNestedFound: this.options.onNestedFound,
      onNestedProgress: this.options.onNestedProgress,
      onNestedPasswordAttempt: this.options.onNestedPasswordAttempt
    });
  }

  /**
   * Extract a single archive file (including volume support)
   */
  async extractArchive(archiveFile, outputDir, passwords = []) {
    const result = new ExtractionResult(archiveFile);
    
    try {
      // Handle volume files specially
      if (archiveFile.isVolume && archiveFile.volumeGroup) {
        return await this._extractVolumeArchive(archiveFile, outputDir, passwords, result);
      } else {
        return await this._extractSingleArchive(archiveFile, outputDir, passwords, result);
      }
    } catch (error) {
      result.complete(false, null, [], error.message);
    }

    return result;
  }

  /**
   * Extract volume archive with validation
   */
  async _extractVolumeArchive(archiveFile, outputDir, passwords, result) {
    const volumeHandler = new VolumeHandler();
    
    // Validate volume integrity first
    const validation = await volumeHandler.validateVolumeIntegrity(archiveFile.volumeGroup);
    
    if (!validation.isValid) {
      // Still attempt extraction even if validation fails, but warn user
      console.warn(`Volume validation warning: ${validation.error}`);
      
      // Check if missing files make extraction impossible
      if (validation.missingFiles && validation.missingFiles.length > 0) {
        const error = `Cannot extract incomplete volume set. Missing files: ${validation.missingFiles.join(', ')}`;
        result.complete(false, null, [], error);
        return result;
      }
    }

    // Get the primary volume for extraction
    const primaryVolume = volumeHandler.getPrimaryVolume(archiveFile.volumeGroup);
    if (!primaryVolume) {
      result.complete(false, null, [], 'Could not determine primary volume file');
      return result;
    }

    // Use the primary volume for extraction - 7z should handle the rest automatically
    const modifiedArchiveFile = { ...primaryVolume };
    return await this._extractSingleArchive(modifiedArchiveFile, outputDir, passwords, result);
  }

  /**
   * Extract single archive file
   */
  async _extractSingleArchive(archiveFile, outputDir, passwords, result) {
    // Create archive-specific output directory
    const archiveOutputDir = this._createArchiveOutputDir(archiveFile, outputDir);
    
    // Combine provided passwords with stored passwords
    const allPasswords = await this._getAllAvailablePasswords(passwords);
    
    // Try extraction with different passwords
    const extractionResult = await this._tryExtractWithPasswords(
      archiveFile, 
      archiveOutputDir, 
      allPasswords,
      result
    );

    if (extractionResult.success) {
      result.complete(true, archiveOutputDir, extractionResult.extractedFiles);
      result.usedPassword = extractionResult.usedPassword;
      
      // Update password usage statistics
      if (result.usedPassword) {
        updatePasswordUsage(result.usedPassword);
      }

      // Handle nested archives if enabled
      if (this.options.handleNested) {
        // Reset processor for new extraction
        this.nestedProcessor.reset();
        
        result.nestedArchives = await this.nestedProcessor.processNestedArchives(
          archiveOutputDir, 
          result,
          0
        );
        
        // Add nested processing statistics
        result.nestedStatistics = this.nestedProcessor.generateStatistics();
      }
    } else {
      result.complete(false, null, [], extractionResult.error);
    }

    return result;
  }

  /**
   * Extract multiple archives in batch
   */
  async extractMultipleArchives(archiveFiles, outputDir, passwords = []) {
    const results = [];
    
    for (const archiveFile of archiveFiles) {
      try {
        const result = await this.extractArchive(archiveFile, outputDir, passwords);
        results.push(result);
      } catch (error) {
        const failedResult = new ExtractionResult(archiveFile);
        failedResult.complete(false, null, [], error.message);
        results.push(failedResult);
      }
    }

    return results;
  }

  /**
   * Get all available passwords (provided + stored)
   */
  async _getAllAvailablePasswords(providedPasswords) {
    const storedPasswords = getAllPasswords();
    const allPasswords = [...providedPasswords];
    
    // Add stored passwords (sorted by usage count)
    storedPasswords
      .sort((a, b) => b.usageCount - a.usageCount)
      .forEach(passwordEntry => {
        if (!allPasswords.includes(passwordEntry.value)) {
          allPasswords.push(passwordEntry.value);
        }
      });

    return allPasswords.slice(0, this.options.maxPasswordAttempts);
  }

  /**
   * Try extraction with multiple passwords
   */
  async _tryExtractWithPasswords(archiveFile, outputDir, passwords, result) {
    
    // First try without password
    if (this.options.onPasswordAttempt) {
      this.options.onPasswordAttempt('(no password)', 1, passwords.length + 1);
    }

    try {
      // Ensure sevenZip is initialized
      await sevenZip.initialize();
      
      const extractResult = await sevenZip.extractArchive(
        archiveFile.filePath,
        outputDir,
        null,
        { onProgress: this.options.onProgress }
      );
      
      return {
        success: true,
        extractedFiles: extractResult.extractedFiles,
        usedPassword: null
      };
    } catch (error) {
      
      // If error is not password-related, don't try other passwords
      const isPasswordError = error.message.includes('Wrong password') || 
                              (error.details && error.details.reason && error.details.reason.includes('Wrong password'));
      
      if (!isPasswordError) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    // Try each password
    for (let i = 0; i < passwords.length; i++) {
      const password = passwords[i];
      
      if (this.options.onPasswordAttempt) {
        this.options.onPasswordAttempt(this._maskPassword(password), i + 2, passwords.length + 1);
      }

      try {
        const extractResult = await sevenZip.extractArchive(
          archiveFile.filePath,
          outputDir,
          password,
          { onProgress: this.options.onProgress }
        );
        
        return {
          success: true,
          extractedFiles: extractResult.extractedFiles,
          usedPassword: password
        };
      } catch (error) {
        
        // Continue trying other passwords only if this is a password error
        const isPasswordError = error.message.includes('Wrong password') || 
                                (error.details && error.details.reason && error.details.reason.includes('Wrong password'));
        
        if (!isPasswordError) {
          return {
            success: false,
            error: error.message
          };
        }
        
        if (i === passwords.length - 1) {
          // Last password failed
          return {
            success: false,
            error: 'All passwords failed'
          };
        }
      }
    }

    return {
      success: false,
      error: 'No valid passwords found'
    };
  }

  /**
   * Create output directory for archive
   */
  _createArchiveOutputDir(archiveFile, baseOutputDir) {
    const archiveName = path.parse(archiveFile.fileName).name;
    let outputDir = path.join(baseOutputDir, archiveName);
    
    // Handle name conflicts
    let counter = 1;
    while (fs.existsSync(outputDir)) {
      outputDir = path.join(baseOutputDir, `${archiveName}(${counter})`);
      counter++;
    }

    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }

  /**
   * Get system temp directory
   */
  _getTempDir() {
    const os = require('os');
    return path.join(os.tmpdir(), 'zp');
  }

  /**
   * Mask password for display
   */
  _maskPassword(password) {
    if (!password || password.length <= 2) {
      return '*'.repeat(password?.length || 4);
    }
    return password[0] + '*'.repeat(password.length - 2) + password[password.length - 1];
  }

  /**
   * Generate extraction summary
   */
  generateSummary(results) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalFiles = results.length;
    const totalExtractedFiles = successful.reduce((sum, r) => sum + r.extractedFiles.length, 0);
    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      totalFiles,
      successCount: successful.length,
      failedCount: failed.length,
      totalExtractedFiles,
      totalTime: Math.round(totalTime * 10) / 10,
      failedFiles: failed.map(r => ({
        fileName: r.archiveFile.fileName,
        reason: r.error
      }))
    };
  }
}

module.exports = {
  ArchiveExtractor,
  ExtractionResult
};