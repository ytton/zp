const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { ErrorFactory } = require('../core/errors');
const { VolumeHandler } = require('../core/volumeHandler');

/**
 * Supported archive file extensions
 */
const ARCHIVE_EXTENSIONS = [
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso',
  '.cab', '.arj', '.lzh', '.ace', '.jar', '.war', '.ear'
];

/**
 * Multi-volume archive patterns
 */
const VOLUME_PATTERNS = [
  /\.(001|002|003|004|005)$/i,           // .001, .002, etc.
  /\.part0*1\.rar$/i,                    // .part01.rar, .part1.rar
  /\.r[0-9]{2}$/i,                       // .r01, .r02, etc. (not .rar)
  /\.z[0-9]{2}$/i,                       // .z01, .z02, etc. (not .zip)
  /\.(7z\.[0-9]{3})$/i                   // .7z.001, .7z.002, etc.
];

/**
 * File information structure
 */
class ArchiveFile {
  constructor(filePath, fileStats) {
    this.filePath = filePath;
    this.fileName = path.basename(filePath);
    this.directory = path.dirname(filePath);
    this.size = fileStats.size;
    this.extension = path.extname(filePath).toLowerCase();
    this.isArchive = false;
    this.isVolume = false;
    this.volumeGroup = null;
    this.format = 'unknown';
    this.isEncrypted = false;
    this.isDamaged = false;
  }
}

/**
 * Recursively scan directory for archive files
 */
async function scanForArchives(scanPath, options = {}) {
  const {
    recursive = true,
    includeHidden = false,
    maxDepth = 10
  } = options;

  if (!fs.existsSync(scanPath)) {
    throw ErrorFactory.invalidPath(scanPath);
  }

  const stats = fs.statSync(scanPath);
  const foundFiles = [];

  if (stats.isFile()) {
    // Single file case
    foundFiles.push(scanPath);
  } else if (stats.isDirectory()) {
    // Directory case
    await scanDirectory(scanPath, foundFiles, 0, maxDepth, includeHidden, recursive);
  } else {
    throw ErrorFactory.invalidPath(scanPath);
  }
  
  // Filter and identify archive files
  const archiveFiles = [];
  for (const filePath of foundFiles) {
    try {
      const fileStats = fs.statSync(filePath);
      if (fileStats.isFile()) {
        const archiveFile = new ArchiveFile(filePath, fileStats);
        
        if (await isArchiveFile(archiveFile)) {
          archiveFile.isArchive = true;
          archiveFile.format = await detectArchiveFormat(archiveFile);
          archiveFile.isVolume = isVolumeFile(archiveFile.fileName);
          
          archiveFiles.push(archiveFile);
        }
      }
    } catch (error) {
      console.warn(`Warning: Cannot access file ${filePath}: ${error.message}`);
    }
  }

  // Group volume files with enhanced analysis
  const groupedFiles = await groupVolumeFiles(archiveFiles);
  
  if (groupedFiles.length === 0) {
    throw ErrorFactory.noArchives(scanPath);
  }

  return groupedFiles;
}

/**
 * Recursively scan a directory
 */
async function scanDirectory(dirPath, foundFiles, currentDepth, maxDepth, includeHidden, recursive) {
  if (currentDepth >= maxDepth) {
    return;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files/directories if not requested
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile()) {
        foundFiles.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        await scanDirectory(fullPath, foundFiles, currentDepth + 1, maxDepth, includeHidden, recursive);
      }
    }
  } catch (error) {
    console.warn(`Warning: Cannot read directory ${dirPath}: ${error.message}`);
  }
}

/**
 * Check if a file is an archive using multiple methods
 */
async function isArchiveFile(archiveFile) {
  // First check by extension
  if (ARCHIVE_EXTENSIONS.includes(archiveFile.extension)) {
    return true;
  }

  // Check if file matches volume patterns (split archives)
  if (isVolumeFile(archiveFile.fileName)) {
    return true;
  }

  // Check if file has suspicious size (potentially disguised archive)
  if (await isPotentiallyDisguisedArchive(archiveFile)) {
    return true;
  }

  return false;
}

/**
 * Detect archive format using 7z
 */
async function detectArchiveFormat(archiveFile) {
  return new Promise((resolve) => {
    const command = `7z l "${archiveFile.filePath}" -slt`;
    
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        resolve('unknown');
        return;
      }

      const output = stdout.toLowerCase();
      
      if (output.includes('type = zip')) {
        resolve('ZIP');
      } else if (output.includes('type = rar')) {
        resolve('RAR');
      } else if (output.includes('type = 7z')) {
        resolve('7Z');
      } else if (output.includes('type = tar')) {
        resolve('TAR');
      } else if (output.includes('type = gzip')) {
        resolve('GZIP');
      } else if (output.includes('type = bzip2')) {
        resolve('BZIP2');
      } else if (output.includes('type = iso')) {
        resolve('ISO');
      } else {
        resolve('ARCHIVE');
      }
    });
  });
}

/**
 * Check if file might be a disguised archive
 */
async function isPotentiallyDisguisedArchive(archiveFile) {
  // Skip binary checks for now, just check suspicious extensions with large sizes
  const suspiciousExtensions = ['.txt', '.doc', '.jpg', '.png', '.mp4', '.avi'];
  const suspiciousSize = 50 * 1024 * 1024; // 50MB
  
  if (suspiciousExtensions.includes(archiveFile.extension) && archiveFile.size > suspiciousSize) {
    // Quick check if 7z can read it
    return new Promise((resolve) => {
      const command = `7z t "${archiveFile.filePath}"`;
      
      exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
        resolve(!error && stdout.includes('Everything is Ok'));
      });
    });
  }
  
  return false;
}

/**
 * Check if filename matches volume patterns
 */
function isVolumeFile(fileName) {
  return VOLUME_PATTERNS.some(pattern => pattern.test(fileName));
}

/**
 * Group volume files together with enhanced analysis
 */
async function groupVolumeFiles(archiveFiles) {
  const volumeHandler = new VolumeHandler();
  const volumeGroups = new Map();
  const standaloneFiles = [];
  
  // First pass: group volume files by base name
  for (const file of archiveFiles) {
    if (file.isVolume) {
      const pattern = volumeHandler.detectVolumePattern(file.fileName);
      if (pattern) {
        const baseName = pattern.getBaseName(file.fileName);
        const groupKey = path.join(file.directory, baseName);
        
        if (!volumeGroups.has(groupKey)) {
          volumeGroups.set(groupKey, []);
        }
        volumeGroups.get(groupKey).push(file);
      } else {
        // Unknown volume pattern, treat as standalone
        standaloneFiles.push(file);
      }
    } else {
      standaloneFiles.push(file);
    }
  }
  
  const result = [...standaloneFiles];
  
  // Second pass: analyze volume groups and create representative files
  for (const [groupKey, volumes] of volumeGroups) {
    try {
      // Analyze volume completeness
      const analysis = await volumeHandler.analyzeVolumeGroup(volumes);
      const primaryVolume = volumeHandler.getPrimaryVolume(volumes);
      
      if (primaryVolume) {
        // Set volume group information
        primaryVolume.volumeGroup = volumes;
        primaryVolume.volumeAnalysis = analysis;
        primaryVolume.isVolume = true;
        
        // Generate volume report for user display
        primaryVolume.volumeReport = volumeHandler.generateVolumeReport(analysis);
        
        result.push(primaryVolume);
      }
    } catch (error) {
      console.warn(`Warning: Error analyzing volume group ${groupKey}: ${error.message}`);
      // Fall back to simple grouping
      const sorted = volumes.sort((a, b) => a.fileName.localeCompare(b.fileName));
      const firstVolume = sorted[0];
      firstVolume.volumeGroup = volumes;
      firstVolume.isVolume = true;
      result.push(firstVolume);
    }
  }
  
  return result;
}

/**
 * Extract base name for volume files
 */
function getVolumeBaseName(fileName) {
  // Remove volume-specific suffixes
  return fileName
    .replace(/\.(001|002|003|004|005)$/i, '')
    .replace(/\.part0*[0-9]+\.rar$/i, '')
    .replace(/\.r[0-9]{2}$/i, '.rar')
    .replace(/\.z[0-9]{2}$/i, '.zip')
    .replace(/\.7z\.[0-9]{3}$/i, '.7z');
}

/**
 * Get archive file information for display
 */
function getArchiveDisplayInfo(archiveFile) {
  let displayName = archiveFile.fileName;
  let displayFormat = archiveFile.format;
  
  if (archiveFile.isVolume && archiveFile.volumeGroup) {
    displayName = getVolumeBaseName(archiveFile.fileName);
    displayFormat = `${archiveFile.format}[分卷]`;
  }
  
  if (archiveFile.extension !== '.zip' && archiveFile.extension !== '.rar' && archiveFile.extension !== '.7z') {
    displayFormat += '[伪装]';
  }
  
  return {
    displayName,
    displayFormat,
    size: formatFileSize(archiveFile.size),
    path: archiveFile.directory,
    volumeCount: archiveFile.volumeGroup ? archiveFile.volumeGroup.length : 1
  };
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

module.exports = {
  scanForArchives,
  isArchiveFile,
  detectArchiveFormat,
  groupVolumeFiles,
  getArchiveDisplayInfo,
  formatFileSize,
  ArchiveFile,
  ARCHIVE_EXTENSIONS,
  VOLUME_PATTERNS
};