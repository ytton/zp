const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get the config directory path based on platform
 */
function getConfigDir() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', '.zp');
  } else {
    // macOS and Linux
    return path.join(os.homedir(), '.zp');
  }
}

/**
 * Get the config file path
 */
function getConfigFilePath() {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

/**
 * Load configuration from file
 */
function loadConfig() {
  const configFile = getConfigFilePath();
  
  if (!fs.existsSync(configFile)) {
    // Return default config if file doesn't exist
    return getDefaultConfig();
  }

  try {
    const configData = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(configData);
    
    // Ensure default structure exists
    return {
      ...getDefaultConfig(),
      ...config
    };
  } catch (error) {
    console.warn(`Warning: Failed to load config file: ${error.message}`);
    return getDefaultConfig();
  }
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  ensureConfigDir();
  const configFile = getConfigFilePath();
  
  try {
    const configData = JSON.stringify(config, null, 2);
    fs.writeFileSync(configFile, configData, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error: Failed to save config file: ${error.message}`);
    return false;
  }
}

/**
 * Get default configuration
 */
function getDefaultConfig() {
  return {
    version: '1.0.0',
    passwords: [],
    preferences: {
      confirmDelete: true,
      showProgress: true,
      maxConcurrent: 3,
      tempDir: process.platform === 'win32' ? '%TEMP%\\zp' : '/tmp/zp'
    }
  };
}

/**
 * Add password to the library
 */
function addPassword(password, label = '') {
  const config = loadConfig();
  
  // Check if password already exists
  const existingPassword = config.passwords.find(p => p.value === password);
  if (existingPassword) {
    return { success: false, message: 'Password already exists in library' };
  }
  
  // Add new password
  const newPassword = {
    value: password,
    addedAt: new Date().toISOString(),
    usageCount: 0,
    label: label
  };
  
  config.passwords.push(newPassword);
  
  if (saveConfig(config)) {
    return { success: true, message: 'Password added successfully' };
  } else {
    return { success: false, message: 'Failed to save password' };
  }
}

/**
 * Remove password from the library
 */
function removePassword(password) {
  const config = loadConfig();
  
  const initialLength = config.passwords.length;
  config.passwords = config.passwords.filter(p => p.value !== password);
  
  if (config.passwords.length === initialLength) {
    return { success: false, message: 'Password not found in library' };
  }
  
  if (saveConfig(config)) {
    return { success: true, message: 'Password removed successfully' };
  } else {
    return { success: false, message: 'Failed to remove password' };
  }
}

/**
 * Get all stored passwords
 */
function getAllPasswords() {
  const config = loadConfig();
  return config.passwords;
}

/**
 * Clear all passwords
 */
function clearAllPasswords() {
  const config = loadConfig();
  config.passwords = [];
  
  if (saveConfig(config)) {
    return { success: true, message: 'All passwords cleared successfully' };
  } else {
    return { success: false, message: 'Failed to clear passwords' };
  }
}

/**
 * Update password usage count
 */
function updatePasswordUsage(password) {
  const config = loadConfig();
  
  const passwordEntry = config.passwords.find(p => p.value === password);
  if (passwordEntry) {
    passwordEntry.usageCount++;
    saveConfig(config);
  }
}

/**
 * Get preferences
 */
function getPreferences() {
  const config = loadConfig();
  return config.preferences;
}

/**
 * Update preferences
 */
function updatePreferences(newPreferences) {
  const config = loadConfig();
  config.preferences = { ...config.preferences, ...newPreferences };
  
  if (saveConfig(config)) {
    return { success: true, message: 'Preferences updated successfully' };
  } else {
    return { success: false, message: 'Failed to update preferences' };
  }
}

module.exports = {
  getConfigDir,
  getConfigFilePath,
  loadConfig,
  saveConfig,
  addPassword,
  removePassword,
  getAllPasswords,
  clearAllPasswords,
  updatePasswordUsage,
  getPreferences,
  updatePreferences
};