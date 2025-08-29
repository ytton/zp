import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * 根据平台获取配置目录路径
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
 * 获取配置文件路径
 */
function getConfigFilePath() {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

/**
 * 从文件加载配置
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
      ...config,
    };
  } catch (error) {
    console.warn(`警告: 加载配置文件失败: ${error.message}`);
    return getDefaultConfig();
  }
}

/**
 * 保存配置到文件
 */
function saveConfig(config) {
  ensureConfigDir();
  const configFile = getConfigFilePath();

  try {
    const configData = JSON.stringify(config, null, 2);
    fs.writeFileSync(configFile, configData, 'utf8');
    return true;
  } catch (error) {
    console.error(`错误: 保存配置文件失败: ${error.message}`);
    return false;
  }
}

/**
 * 获取默认配置
 */
function getDefaultConfig() {
  return {
    version: '1.0.0',
    passwords: [],
    preferences: {
      confirmDelete: true,
      showProgress: true,
      maxConcurrent: 3,
      tempDir: process.platform === 'win32' ? '%TEMP%\\zp' : '/tmp/zp',
    },
  };
}

/**
 * 添加密码到密码库
 */
function addPassword(password, label = '') {
  const config = loadConfig();

  // 检查密码是否已存在
  const existingPassword = config.passwords.find(p => p.value === password);
  if (existingPassword) {
    return { success: false, message: '密码已存在于密码库中' };
  }

  // 添加新密码
  const newPassword = {
    value: password,
    addedAt: new Date().toISOString(),
    usageCount: 0,
    label: label,
  };

  config.passwords.push(newPassword);

  if (saveConfig(config)) {
    return { success: true, message: '密码添加成功' };
  } else {
    return { success: false, message: '保存密码失败' };
  }
}

/**
 * 从密码库移除密码
 */
function removePassword(password) {
  const config = loadConfig();

  const initialLength = config.passwords.length;
  config.passwords = config.passwords.filter(p => p.value !== password);

  if (config.passwords.length === initialLength) {
    return { success: false, message: '密码库中未找到该密码' };
  }

  if (saveConfig(config)) {
    return { success: true, message: '密码删除成功' };
  } else {
    return { success: false, message: '删除密码失败' };
  }
}

/**
 * 获取所有存储的密码
 */
function getAllPasswords() {
  const config = loadConfig();
  return config.passwords;
}

/**
 * 清空所有密码
 */
function clearAllPasswords() {
  const config = loadConfig();
  config.passwords = [];

  if (saveConfig(config)) {
    return { success: true, message: '所有密码已清空' };
  } else {
    return { success: false, message: '清空密码失败' };
  }
}

/**
 * 更新密码使用次数
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
 * 获取偏好设置
 */
function getPreferences() {
  const config = loadConfig();
  return config.preferences;
}

/**
 * 更新偏好设置
 */
function updatePreferences(newPreferences) {
  const config = loadConfig();
  config.preferences = { ...config.preferences, ...newPreferences };

  if (saveConfig(config)) {
    return { success: true, message: '偏好设置更新成功' };
  } else {
    return { success: false, message: '更新偏好设置失败' };
  }
}

export {
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
  updatePreferences,
};
