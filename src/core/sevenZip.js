const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkSystemRequirements } = require('../utils/system');
const { ErrorFactory } = require('./errors');

/**
 * 7z command wrapper for archive operations
 */
class SevenZipWrapper {
  constructor() {
    this.sevenZipPath = null;
    this.isInitialized = false;
  }

  /**
   * Initialize 7z wrapper
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      const systemInfo = await checkSystemRequirements();
      this.sevenZipPath = systemInfo.sevenZipPath;
      this.isInitialized = true;
    } catch (error) {
      throw ErrorFactory.no7Zip();
    }
  }

  /**
   * Test archive integrity
   */
  async testArchive(archivePath, password = null) {
    await this.initialize();

    const command = this._buildCommand('t', archivePath, null, password, {
      listFormat: false,
      overwrite: false
    });

    return new Promise((resolve, reject) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        // Check for password prompts and errors
        const passwordIndicators = [
          'Enter password',
          'Wrong password', 
          'Data Error in encrypted file'
        ];
        
        const hasPasswordError = passwordIndicators.some(indicator => 
          stdout.includes(indicator) || stderr.includes(indicator)
        );
        
        if (hasPasswordError) {
          resolve({ success: false, error: 'wrong_password' });
          return;
        }
        
        if (error) {
          if (stderr.includes('Wrong password') || stdout.includes('Wrong password')) {
            resolve({ success: false, error: 'wrong_password' });
          } else if (stderr.includes('Data Error') || stdout.includes('Data Error')) {
            resolve({ success: false, error: 'corrupted' });
          } else {
            resolve({ success: false, error: 'unknown', details: stderr || stdout });
          }
          return;
        }

        if (stdout.includes('Everything is Ok')) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: 'test_failed', details: stdout });
        }
      });
    });
  }

  /**
   * List archive contents
   */
  async listArchive(archivePath, password = null) {
    await this.initialize();

    const command = this._buildCommand('l', archivePath, null, password, {
      listFormat: true,
      technical: true
    });

    return new Promise((resolve, reject) => {
      exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          reject(ErrorFactory.extractionFailed(archivePath, stderr || error.message));
          return;
        }

        try {
          const fileList = this._parseFileList(stdout);
          const archiveInfo = this._parseArchiveInfo(stdout);
          
          resolve({
            files: fileList,
            info: archiveInfo,
            totalFiles: fileList.length,
            totalSize: fileList.reduce((sum, file) => sum + file.size, 0)
          });
        } catch (parseError) {
          reject(ErrorFactory.extractionFailed(archivePath, parseError.message));
        }
      });
    });
  }

  /**
   * Extract archive to destination
   */
  async extractArchive(archivePath, outputPath, password = null, options = {}) {
    await this.initialize();

    const {
      overwrite = true,
      preservePaths = true,
      onProgress = null,
      specificFiles = null
    } = options;

    // Ensure output directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const command = this._buildCommand('x', archivePath, outputPath, password, {
      overwrite,
      preservePaths,
      specificFiles
    });

    return new Promise((resolve, reject) => {
      if (onProgress) {
        // Use spawn for progress monitoring
        this._extractWithProgress(command, onProgress, resolve, reject);
      } else {
        // Use exec for simple extraction
        exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
          // Check for password prompts and password-related errors
          const passwordIndicators = [
            'Enter password',
            'Wrong password',
            'Data Error in encrypted file'
          ];
          
          const hasPasswordError = passwordIndicators.some(indicator => 
            stdout.includes(indicator) || stderr.includes(indicator)
          );
          
          if (hasPasswordError) {
            reject(ErrorFactory.extractionFailed(archivePath, 'Wrong password'));
            return;
          }
          
          if (error) {
            if (stderr.includes('Wrong password') || stdout.includes('Wrong password')) {
              reject(ErrorFactory.extractionFailed(archivePath, 'Wrong password'));
            } else {
              reject(ErrorFactory.extractionFailed(archivePath, stderr || error.message));
            }
            return;
          }

          if (stdout.includes('Everything is Ok')) {
            const extractedFiles = this._parseExtractedFiles(stdout);
            resolve({
              success: true,
              outputPath,
              extractedFiles
            });
          } else {
            reject(ErrorFactory.extractionFailed(archivePath, 'Extraction completed with warnings'));
          }
        });
      }
    });
  }

  /**
   * Extract with progress monitoring
   */
  _extractWithProgress(command, onProgress, resolve, reject) {
    // Parse command properly, handling quoted arguments
    const parts = this._parseCommand(command);
    const executable = parts[0];
    const args = parts.slice(1);
    
    const child = spawn(executable, args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      
      // Parse progress information
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch && onProgress) {
        const percentage = parseInt(progressMatch[1]);
        onProgress(percentage);
      }
    });

    child.stderr.on('data', (data) => {
      const stderrChunk = data.toString();
      stderr += stderrChunk;
    });

    child.on('close', (code) => {
      // Check for password prompts and errors in output
      const passwordIndicators = [
        'Enter password',
        'Wrong password',
        'Data Error in encrypted file'
      ];
      
      const hasPasswordError = passwordIndicators.some(indicator => 
        stdout.includes(indicator) || stderr.includes(indicator)
      );
      
      if (hasPasswordError) {
        reject(ErrorFactory.extractionFailed('archive', 'Wrong password'));
        return;
      }
      
      if (code === 0 && stdout.includes('Everything is Ok')) {
        const extractedFiles = this._parseExtractedFiles(stdout);
        resolve({
          success: true,
          extractedFiles
        });
      } else {
        reject(ErrorFactory.extractionFailed('archive', stderr || `Process exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(ErrorFactory.extractionFailed('archive', error.message));
    });
  }

  /**
   * Parse command string with quoted arguments
   */
  _parseCommand(command) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      
      if (char === '"' && (i === 0 || command[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    return parts;
  }

  /**
   * Build 7z command
   */
  _buildCommand(operation, archivePath, outputPath = null, password = null, options = {}) {
    const cmd = this.sevenZipPath === '7z' ? '7z' : `"${this.sevenZipPath}"`;
    let command = `${cmd} ${operation}`;

    // Add archive path
    command += ` "${archivePath}"`;

    // Add output path for extraction
    if (outputPath && (operation === 'x' || operation === 'e')) {
      command += ` -o"${outputPath}"`;
    }

    // Add password
    if (password) {
      command += ` -p"${password}"`;
    }

    // Add options
    if (options.overwrite) {
      command += ' -aoa'; // Overwrite all
    } else {
      command += ' -aos'; // Skip existing
    }

    if (options.listFormat) {
      command += ' -slt'; // Technical format
    }

    if (options.preservePaths === false) {
      command += ' -e'; // Extract without folder structure
    }

    if (options.specificFiles && Array.isArray(options.specificFiles)) {
      options.specificFiles.forEach(file => {
        command += ` "${file}"`;
      });
    }

    // Always add basic options
    command += ' -bb1'; // Set output log level
    command += ' -y';   // Assume Yes on all queries

    return command;
  }

  /**
   * Parse file list from 7z output
   */
  _parseFileList(output) {
    const files = [];
    const lines = output.split('\n');
    
    let inFileSection = false;
    let currentFile = {};

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('Path = ')) {
        if (Object.keys(currentFile).length > 0) {
          files.push(currentFile);
        }
        currentFile = {
          path: trimmedLine.substring(7),
          name: '',
          size: 0,
          isDirectory: false,
          modified: null
        };
        inFileSection = true;
      } else if (inFileSection) {
        if (trimmedLine.startsWith('Size = ')) {
          currentFile.size = parseInt(trimmedLine.substring(7)) || 0;
        } else if (trimmedLine.startsWith('Folder = ')) {
          currentFile.isDirectory = trimmedLine.substring(9) === '+';
        } else if (trimmedLine.startsWith('Modified = ')) {
          currentFile.modified = trimmedLine.substring(11);
        }
      }
    }

    if (Object.keys(currentFile).length > 0) {
      files.push(currentFile);
    }

    // Set file names
    files.forEach(file => {
      file.name = path.basename(file.path);
    });

    return files;
  }

  /**
   * Parse archive information
   */
  _parseArchiveInfo(output) {
    const info = {
      type: 'unknown',
      method: 'unknown',
      solid: false,
      encrypted: false,
      comment: ''
    };

    const lines = output.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('Type = ')) {
        info.type = trimmedLine.substring(7);
      } else if (trimmedLine.startsWith('Method = ')) {
        info.method = trimmedLine.substring(9);
      } else if (trimmedLine.startsWith('Solid = ')) {
        info.solid = trimmedLine.substring(8) === '+';
      } else if (trimmedLine.includes('Encrypted')) {
        info.encrypted = true;
      }
    }

    return info;
  }

  /**
   * Parse extracted files from output
   */
  _parseExtractedFiles(output) {
    const files = [];
    const lines = output.split('\n');
    
    // Look for extraction patterns in 7z output
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Primary pattern: "- filename" (most common in 7z 17.05)
      if (trimmedLine.startsWith('- ') && 
          !trimmedLine.includes('archive:') && 
          !trimmedLine.includes('Testing') &&
          !trimmedLine.includes('listing')) {
        const filePath = trimmedLine.substring(2);
        if (filePath && filePath.length > 0) {
          files.push(filePath);
        }
      }
      // Secondary pattern: "Extracting filename" (some versions)
      else if ((line.includes('Extracting  ') || line.includes('Extracting ')) &&
               !line.includes('archive:')) {
        const filePath = line.substring(line.indexOf('Extracting') + 11).trim();
        if (filePath && !filePath.includes('...')) {
          files.push(filePath);
        }
      }
    }

    // If no files found but extraction was successful, return placeholder
    if (files.length === 0 && output.includes('Everything is Ok')) {
      return ['[extraction completed successfully]'];
    }

    // Clean up and return unique valid file paths
    return [...new Set(files)].filter(file => 
      file.length > 0 && 
      file.length < 500 && // Reasonable path length limit
      !file.includes('ERROR') &&
      !file.includes('WARNING') &&
      !file.match(/^[A-Z][\w\s]*:/) && // Skip header lines like "Type = 7z"
      !file.includes('p7zip Version') // Skip version info
    );
  }
}

// Export singleton instance
const sevenZip = new SevenZipWrapper();

module.exports = {
  SevenZipWrapper,
  sevenZip
};