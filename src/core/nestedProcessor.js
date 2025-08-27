const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Nested archive processor with advanced cycle detection and recursion limits
 */
class NestedArchiveProcessor {
  constructor(options = {}) {
    this.options = {
      maxDepth: 10,           // Maximum recursion depth
      maxTotalArchives: 100,  // Maximum total nested archives to process
      enableCycleDetection: true,
      cleanupMode: 'success', // 'success', 'always', 'never'
      trackStatistics: true,
      ...options
    };
    
    // Cycle detection data structures
    this.processedHashes = new Set();
    this.currentPath = [];
    this.statistics = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      cyclesDetected: 0,
      maxDepthReached: 0,
      cleanedFiles: 0
    };
  }

  /**
   * Process nested archives in extracted directory
   */
  async processNestedArchives(extractedDir, parentResult, currentDepth = 0) {
    if (currentDepth >= this.options.maxDepth) {
      console.warn(`Maximum recursion depth (${this.options.maxDepth}) reached`);
      this.statistics.maxDepthReached = Math.max(this.statistics.maxDepthReached, currentDepth);
      return [];
    }

    if (this.statistics.totalProcessed >= this.options.maxTotalArchives) {
      console.warn(`Maximum total archives limit (${this.options.maxTotalArchives}) reached`);
      return [];
    }

    const nestedArchives = [];
    
    try {
      const { scanForArchives } = require('../utils/fileScanner');
      const foundArchives = await scanForArchives(extractedDir, {
        recursive: true,
        includeHidden: false,
        maxDepth: 3
      });

      console.log(`Found ${foundArchives.length} nested archive(s) at depth ${currentDepth}`);

      for (const nestedArchive of foundArchives) {
        // Check cycle detection
        if (this.options.enableCycleDetection && await this._detectCycle(nestedArchive)) {
          console.warn(`Cycle detected for ${nestedArchive.fileName}, skipping`);
          this.statistics.cyclesDetected++;
          continue;
        }

        // Add to current processing path
        this.currentPath.push(nestedArchive.fileName);
        this.statistics.totalProcessed++;

        // Notify about nested archive found
        if (this.options.onNestedFound) {
          this.options.onNestedFound(nestedArchive, currentDepth);
        }

        try {
          // Extract nested archive
          const nestedResult = await this._extractNestedArchive(
            nestedArchive, 
            extractedDir, 
            parentResult, 
            currentDepth
          );

          nestedArchives.push(nestedResult);

          if (nestedResult.success) {
            this.statistics.successfulExtractions++;
            
            // Process further nested archives recursively
            if (nestedResult.outputPath && currentDepth < this.options.maxDepth - 1) {
              const deeperNested = await this.processNestedArchives(
                nestedResult.outputPath, 
                nestedResult, 
                currentDepth + 1
              );
              nestedResult.nestedArchives = deeperNested;
            }

            // Clean up nested archive file
            await this._cleanupNestedFile(nestedArchive, nestedResult);
          } else {
            this.statistics.failedExtractions++;
          }
        } catch (error) {
          console.error(`Error processing nested archive ${nestedArchive.fileName}:`, error.message);
          this.statistics.failedExtractions++;
        }

        // Remove from current processing path
        this.currentPath.pop();
      }
    } catch (error) {
      console.warn(`Warning: Error scanning for nested archives: ${error.message}`);
    }

    return nestedArchives;
  }

  /**
   * Extract a single nested archive
   */
  async _extractNestedArchive(nestedArchive, extractedDir, parentResult, currentDepth) {
    // Dynamic import to avoid circular dependency
    const { ArchiveExtractor } = require('./extractor');
    
    // Create a new extractor instance for nested processing
    const nestedExtractor = new ArchiveExtractor({
      maxPasswordAttempts: this.options.maxPasswordAttempts || 10,
      preserveArchivePaths: this.options.preserveArchivePaths !== false,
      handleNested: false, // Prevent infinite recursion - we handle nesting manually
      onProgress: this.options.onNestedProgress,
      onPasswordAttempt: this.options.onNestedPasswordAttempt
    });

    // Use parent's password first, then global passwords
    const passwords = [];
    if (parentResult.usedPassword) {
      passwords.push(parentResult.usedPassword);
    }
    
    const result = await nestedExtractor.extractArchive(
      nestedArchive,
      extractedDir,
      passwords
    );

    // Enhance result with nested processing metadata
    result.nestingLevel = currentDepth + 1;
    result.parentArchive = parentResult.archiveFile.fileName;
    
    return result;
  }

  /**
   * Detect potential cycles in nested archives
   */
  async _detectCycle(archiveFile) {
    if (!this.options.enableCycleDetection) {
      return false;
    }

    try {
      // Generate hash based on file content and path
      const fileBuffer = fs.readFileSync(archiveFile.filePath);
      const hash = crypto.createHash('sha256');
      hash.update(fileBuffer);
      hash.update(archiveFile.fileName);
      const contentHash = hash.digest('hex');

      // Check if we've seen this exact content before
      if (this.processedHashes.has(contentHash)) {
        return true;
      }

      // Check if this filename appears in current path (simple cycle)
      if (this.currentPath.includes(archiveFile.fileName)) {
        return true;
      }

      // Add to processed hashes
      this.processedHashes.add(contentHash);
      
      return false;
    } catch (error) {
      console.warn(`Warning: Cycle detection failed for ${archiveFile.fileName}:`, error.message);
      return false;
    }
  }

  /**
   * Clean up nested archive files after extraction
   */
  async _cleanupNestedFile(nestedArchive, extractionResult) {
    const shouldCleanup = 
      this.options.cleanupMode === 'always' || 
      (this.options.cleanupMode === 'success' && extractionResult.success);

    if (!shouldCleanup) {
      return;
    }

    try {
      fs.unlinkSync(nestedArchive.filePath);
      this.statistics.cleanedFiles++;
      console.log(`Cleaned up nested archive: ${nestedArchive.fileName}`);
    } catch (error) {
      console.warn(`Warning: Could not remove nested archive ${nestedArchive.fileName}: ${error.message}`);
    }
  }

  /**
   * Generate nested processing statistics
   */
  generateStatistics() {
    if (!this.options.trackStatistics) {
      return null;
    }

    return {
      ...this.statistics,
      successRate: this.statistics.totalProcessed > 0 
        ? (this.statistics.successfulExtractions / this.statistics.totalProcessed * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Reset processor state for new extraction
   */
  reset() {
    this.processedHashes.clear();
    this.currentPath = [];
    this.statistics = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      cyclesDetected: 0,
      maxDepthReached: 0,
      cleanedFiles: 0
    };
  }
}

module.exports = {
  NestedArchiveProcessor
};