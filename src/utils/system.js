const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ErrorFactory } = require('../core/errors');

/**
 * Check if 7-Zip is installed and accessible
 */
async function check7ZipInstallation() {
  // Try PATH lookup first (works on all platforms)
  try {
    execSync('7z', { stdio: 'ignore', timeout: 5000 });
    return '7z'; // Available in PATH
  } catch (error) {
    // Not in PATH or failed, continue with platform-specific checks
  }

  // Platform-specific installation paths
  if (process.platform === 'win32') {
    return await checkWindows7ZipInstallation();
  } else if (process.platform === 'darwin') {
    return await checkMac7ZipInstallation();
  } else if (process.platform === 'linux') {
    return await checkLinux7ZipInstallation();
  }

  throw ErrorFactory.no7Zip();
}

/**
 * Check Windows-specific 7-Zip installation
 */
async function checkWindows7ZipInstallation() {
  const possiblePaths = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    process.env.PROGRAMFILES + '\\7-Zip\\7z.exe',
    process.env['PROGRAMFILES(X86)'] + '\\7-Zip\\7z.exe'
  ];

  // Try registry lookup first
  try {
    const registryPath = await getSevenZipPathFromRegistry();
    if (registryPath && fs.existsSync(registryPath)) {
      return registryPath;
    }
  } catch (error) {
    // Registry lookup failed, continue with other methods
  }

  // Try common installation paths
  for (const zipPath of possiblePaths) {
    if (zipPath && fs.existsSync(zipPath)) {
      return zipPath;
    }
  }

  throw ErrorFactory.no7Zip();
}

/**
 * Check macOS-specific 7-Zip installation
 */
async function checkMac7ZipInstallation() {
  const possiblePaths = [
    '/usr/local/bin/7z',
    '/opt/homebrew/bin/7z',
    '/usr/bin/7z',
    '/opt/local/bin/7z'  // MacPorts
  ];

  // Check common installation paths
  for (const zipPath of possiblePaths) {
    if (fs.existsSync(zipPath)) {
      return zipPath;
    }
  }

  throw ErrorFactory.no7Zip();
}

/**
 * Check Linux-specific 7-Zip installation
 */
async function checkLinux7ZipInstallation() {
  const possiblePaths = [
    '/usr/bin/7z',
    '/usr/local/bin/7z',
    '/bin/7z'
  ];

  // Check common installation paths
  for (const zipPath of possiblePaths) {
    if (fs.existsSync(zipPath)) {
      return zipPath;
    }
  }

  throw ErrorFactory.no7Zip();
}

/**
 * Get 7-Zip installation path from Windows registry
 */
async function getSevenZipPathFromRegistry() {
  return new Promise((resolve, reject) => {
    const registryKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\7-Zip';
    
    exec(`reg query "${registryKey}" /v Path`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error('Registry lookup failed'));
        return;
      }

      const match = stdout.match(/Path\s+REG_SZ\s+(.+)/);
      if (match) {
        const installPath = match[1].trim();
        const executablePath = path.join(installPath, '7z.exe');
        resolve(executablePath);
      } else {
        reject(new Error('Path not found in registry'));
      }
    });
  });
}

/**
 * Test 7-Zip functionality
 */
async function test7ZipFunctionality(sevenZipPath) {
  return new Promise((resolve, reject) => {
    // Simple command to test if 7z is working
    const command = sevenZipPath === '7z' ? '7z' : `"${sevenZipPath}"`;
    
    exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(ErrorFactory.no7Zip());
        return;
      }
      
      // Check if output contains expected 7-Zip information
      const output = stdout + stderr;
      if (output.includes('7-Zip') || output.includes('Usage:') || output.includes('Everything is Ok')) {
        resolve(true);
      } else {
        reject(ErrorFactory.no7Zip());
      }
    });
  });
}

/**
 * Get 7-Zip version information
 */
async function get7ZipVersion(sevenZipPath) {
  return new Promise((resolve, reject) => {
    const command = sevenZipPath === '7z' ? '7z' : `"${sevenZipPath}"`;
    
    exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      const output = stdout + stderr;
      const versionMatch = output.match(/7-Zip\s+(\d+\.\d+)/);
      if (versionMatch) {
        resolve(versionMatch[1]);
      } else {
        resolve('unknown');
      }
    });
  });
}

/**
 * Check all system requirements
 */
async function checkSystemRequirements() {
  // Check Node.js version
  const nodeVersion = process.version.substring(1); // Remove 'v' prefix
  const majorVersion = parseInt(nodeVersion.split('.')[0]);
  if (majorVersion < 14) {
    throw new Error('Node.js 14.0.0 or higher is required');
  }

  // Check 7-Zip installation
  const sevenZipPath = await check7ZipInstallation();
  await test7ZipFunctionality(sevenZipPath);
  
  return {
    sevenZipPath,
    nodeVersion,
    platform: process.platform
  };
}

module.exports = {
  check7ZipInstallation,
  checkWindows7ZipInstallation,
  checkMac7ZipInstallation,
  checkLinux7ZipInstallation,
  getSevenZipPathFromRegistry,
  test7ZipFunctionality,
  get7ZipVersion,
  checkSystemRequirements
};