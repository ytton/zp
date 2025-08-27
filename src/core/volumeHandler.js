const fs = require('fs');
const path = require('path');
const { ErrorFactory } = require('./errors');

/**
 * Volume archive handler for processing split/multi-volume archives
 */
class VolumeHandler {
  constructor() {
    // Supported volume patterns with their parsing rules
    this.volumePatterns = [
      {
        name: 'numeric',
        pattern: /^(.+)\.(001|[0-9]{2,3})$/i,
        getBaseName: (fileName) => fileName.replace(/\.(001|[0-9]{2,3})$/i, ''),
        getVolumeNumber: (fileName) => {
          const match = fileName.match(/\.([0-9]{2,3})$/i);
          return match ? parseInt(match[1], 10) : 0;
        },
        generatePattern: (baseName) => `${baseName}.###`
      },
      {
        name: 'rar_part',
        pattern: /^(.+)\.part0*([0-9]+)\.rar$/i,
        getBaseName: (fileName) => fileName.replace(/\.part0*[0-9]+\.rar$/i, ''),
        getVolumeNumber: (fileName) => {
          const match = fileName.match(/\.part0*([0-9]+)\.rar$/i);
          return match ? parseInt(match[1], 10) : 0;
        },
        generatePattern: (baseName) => `${baseName}.part##.rar`
      },
      {
        name: 'rar_r',
        pattern: /^(.+)\.r([0-9]{2})$/i,
        getBaseName: (fileName) => fileName.replace(/\.r[0-9]{2}$/i, '.rar'),
        getVolumeNumber: (fileName) => {
          const match = fileName.match(/\.r([0-9]{2})$/i);
          return match ? parseInt(match[1], 10) + 1 : 0; // r01 = volume 2
        },
        generatePattern: (baseName) => `${baseName.replace('.rar', '')}.r##`
      },
      {
        name: 'zip_z',
        pattern: /^(.+)\.z([0-9]{2})$/i,
        getBaseName: (fileName) => fileName.replace(/\.z[0-9]{2}$/i, '.zip'),
        getVolumeNumber: (fileName) => {
          const match = fileName.match(/\.z([0-9]{2})$/i);
          return match ? parseInt(match[1], 10) + 1 : 0; // z01 = volume 2
        },
        generatePattern: (baseName) => `${baseName.replace('.zip', '')}.z##`
      },
      {
        name: '7z_numbered',
        pattern: /^(.+)\.7z\.([0-9]{3})$/i,
        getBaseName: (fileName) => fileName.replace(/\.7z\.[0-9]{3}$/i, '.7z'),
        getVolumeNumber: (fileName) => {
          const match = fileName.match(/\.7z\.([0-9]{3})$/i);
          return match ? parseInt(match[1], 10) : 0;
        },
        generatePattern: (baseName) => `${baseName}.###`
      }
    ];
  }

  /**
   * Analyze volume group and check completeness
   */
  async analyzeVolumeGroup(volumeGroup) {
    if (!volumeGroup || volumeGroup.length === 0) {
      throw ErrorFactory.missingVolume('No volume files provided');
    }

    const firstVolume = volumeGroup[0];
    const pattern = this.detectVolumePattern(firstVolume.fileName);
    
    if (!pattern) {
      return {
        isValid: false,
        error: 'Unknown volume pattern',
        volumes: volumeGroup
      };
    }

    const baseName = pattern.getBaseName(firstVolume.fileName);
    const analysis = {
      pattern: pattern.name,
      baseName,
      expectedPattern: pattern.generatePattern(baseName),
      volumes: [],
      missing: [],
      isComplete: false,
      totalSize: 0,
      firstVolumeSize: 0
    };

    // Analyze each volume
    const volumeMap = new Map();
    for (const volume of volumeGroup) {
      const volumeNumber = pattern.getVolumeNumber(volume.fileName);
      volumeMap.set(volumeNumber, volume);
      
      analysis.volumes.push({
        number: volumeNumber,
        fileName: volume.fileName,
        size: volume.size,
        exists: true
      });
      
      analysis.totalSize += volume.size;
    }

    // Sort volumes by number
    analysis.volumes.sort((a, b) => a.number - b.number);
    
    // Check for missing volumes
    const volumeNumbers = analysis.volumes.map(v => v.number);
    const minVolume = Math.min(...volumeNumbers);
    const maxVolume = Math.max(...volumeNumbers);
    
    analysis.firstVolumeSize = volumeMap.get(minVolume)?.size || 0;
    
    // Check for gaps in sequence
    for (let i = minVolume; i <= maxVolume; i++) {
      if (!volumeNumbers.includes(i)) {
        const missingFileName = this.generateExpectedFileName(baseName, i, pattern);
        analysis.missing.push({
          number: i,
          expectedFileName: missingFileName
        });
      }
    }

    analysis.isComplete = analysis.missing.length === 0;
    analysis.isValid = true;

    return analysis;
  }

  /**
   * Detect which volume pattern matches the filename
   */
  detectVolumePattern(fileName) {
    for (const pattern of this.volumePatterns) {
      if (pattern.pattern.test(fileName)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Generate expected filename for missing volume
   */
  generateExpectedFileName(baseName, volumeNumber, pattern) {
    switch (pattern.name) {
      case 'numeric':
        return `${baseName}.${volumeNumber.toString().padStart(3, '0')}`;
      
      case 'rar_part':
        return `${baseName}.part${volumeNumber.toString().padStart(2, '0')}.rar`;
      
      case 'rar_r':
        const rNum = (volumeNumber - 1).toString().padStart(2, '0');
        return `${baseName.replace('.rar', '')}.r${rNum}`;
      
      case 'zip_z':
        const zNum = (volumeNumber - 1).toString().padStart(2, '0');
        return `${baseName.replace('.zip', '')}.z${zNum}`;
      
      case '7z_numbered':
        return `${baseName}.${volumeNumber.toString().padStart(3, '0')}`;
      
      default:
        return `${baseName}.${volumeNumber}`;
    }
  }

  /**
   * Check if all required volumes exist in the same directory
   */
  async validateVolumeIntegrity(volumeGroup) {
    const analysis = await this.analyzeVolumeGroup(volumeGroup);
    
    if (!analysis.isValid) {
      return {
        isValid: false,
        error: analysis.error,
        analysis
      };
    }

    if (!analysis.isComplete) {
      const missingFiles = analysis.missing.map(m => m.expectedFileName);
      return {
        isValid: false,
        error: `Missing volume files: ${missingFiles.join(', ')}`,
        analysis,
        missingFiles
      };
    }

    // Additional integrity checks could be added here
    // For example, checking if all volumes except the last have similar sizes
    const volumes = analysis.volumes.filter(v => v.exists);
    if (volumes.length > 1) {
      const firstSize = volumes[0].size;
      const sizeTolerance = firstSize * 0.1; // 10% tolerance
      
      // Check if all volumes except the last have similar sizes
      for (let i = 0; i < volumes.length - 1; i++) {
        const currentSize = volumes[i].size;
        if (Math.abs(currentSize - firstSize) > sizeTolerance) {
          console.warn(`Volume ${volumes[i].fileName} has unexpected size: ${currentSize} bytes (expected ~${firstSize})`);
        }
      }
    }

    return {
      isValid: true,
      analysis
    };
  }

  /**
   * Get the primary volume file (usually .001 or .part01.rar)
   */
  getPrimaryVolume(volumeGroup) {
    if (!volumeGroup || volumeGroup.length === 0) {
      return null;
    }

    // Sort by volume number and return the first one
    const sorted = volumeGroup.slice().sort((a, b) => {
      const patternA = this.detectVolumePattern(a.fileName);
      const patternB = this.detectVolumePattern(b.fileName);
      
      if (!patternA || !patternB) {
        return a.fileName.localeCompare(b.fileName);
      }
      
      const numA = patternA.getVolumeNumber(a.fileName);
      const numB = patternB.getVolumeNumber(b.fileName);
      
      return numA - numB;
    });

    return sorted[0];
  }

  /**
   * Check if 7z can handle this volume set directly
   */
  async canExtractVolumes(primaryVolume) {
    // 7z can usually handle volume extraction if given the first volume
    // We'll rely on 7z's built-in volume handling for most cases
    return {
      canExtract: true,
      primaryFile: primaryVolume.filePath,
      extractionMethod: '7z_native'
    };
  }

  /**
   * Generate user-friendly volume status report
   */
  generateVolumeReport(analysis) {
    if (!analysis.isValid) {
      return {
        status: 'error',
        message: analysis.error,
        details: null
      };
    }

    const report = {
      status: analysis.isComplete ? 'complete' : 'incomplete',
      pattern: analysis.pattern,
      totalVolumes: analysis.volumes.length,
      totalSize: this.formatFileSize(analysis.totalSize),
      details: {
        baseName: analysis.baseName,
        volumes: analysis.volumes,
        missing: analysis.missing
      }
    };

    if (analysis.isComplete) {
      report.message = `Complete volume set: ${analysis.volumes.length} volumes, ${report.totalSize} total`;
    } else {
      const missingCount = analysis.missing.length;
      const missingFiles = analysis.missing.map(m => m.expectedFileName);
      report.message = `Incomplete volume set: ${missingCount} missing volume(s)`;
      report.missingFiles = missingFiles;
    }

    return report;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  }
}

module.exports = {
  VolumeHandler
};