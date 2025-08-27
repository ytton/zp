/**
 * Custom error class for ZP operations
 */
class ZPError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'ZPError';
    this.code = code;
    this.details = details;
  }

  /**
   * Create a user-friendly error message with suggestions
   */
  getUserMessage() {
    const codeMessages = {
      [ErrorCodes.NO_7ZIP]: 'Please download and install 7-Zip from https://www.7-zip.org',
      [ErrorCodes.INVALID_PATH]: 'Please check the path exists and is accessible',
      [ErrorCodes.NO_ARCHIVES]: 'No archive files found in the specified path',
      [ErrorCodes.EXTRACTION_FAILED]: 'Try different passwords or check if the archive is corrupted',
      [ErrorCodes.MISSING_VOLUME]: 'Ensure all volume files are present in the same directory',
      [ErrorCodes.CORRUPTED_FILE]: 'The archive file appears to be corrupted',
      [ErrorCodes.INSUFFICIENT_SPACE]: 'Free up disk space and try again'
    };

    const suggestion = codeMessages[this.code];
    return suggestion ? `${this.message}\n   ${suggestion}` : this.message;
  }
}

/**
 * Standard error codes used throughout the application
 */
const ErrorCodes = {
  NO_7ZIP: 'E001',
  INVALID_PATH: 'E002', 
  NO_ARCHIVES: 'E003',
  EXTRACTION_FAILED: 'E004',
  MISSING_VOLUME: 'E005',
  CORRUPTED_FILE: 'E006',
  INSUFFICIENT_SPACE: 'E007'
};

/**
 * Factory functions for common errors
 */
const ErrorFactory = {
  no7Zip() {
    return new ZPError('7-Zip not found', ErrorCodes.NO_7ZIP);
  },

  invalidPath(path) {
    return new ZPError(`Invalid path: ${path}`, ErrorCodes.INVALID_PATH, { path });
  },

  noArchives(scanPath) {
    return new ZPError(`No archives found in ${scanPath}`, ErrorCodes.NO_ARCHIVES, { scanPath });
  },

  extractionFailed(filePath, reason) {
    return new ZPError(`Failed to extract ${filePath}`, ErrorCodes.EXTRACTION_FAILED, { filePath, reason });
  },

  missingVolume(volumePath) {
    return new ZPError(`Missing volume file: ${volumePath}`, ErrorCodes.MISSING_VOLUME, { volumePath });
  },

  corruptedFile(filePath) {
    return new ZPError(`Corrupted archive: ${filePath}`, ErrorCodes.CORRUPTED_FILE, { filePath });
  },

  insufficientSpace(required, available) {
    return new ZPError('Insufficient disk space', ErrorCodes.INSUFFICIENT_SPACE, { required, available });
  }
};

module.exports = {
  ZPError,
  ErrorCodes,
  ErrorFactory
};