import _7z from '7zip-min';
import sevenZipBin from '7zip-bin-full';
import { promises as fs } from 'fs';

// 配置使用 7zip-bin-full 的路径
_7z.config({
  binaryPath: sevenZipBin.path7z,
});

/**
 * 检查文件是否为有效的压缩包
 */
export async function isArchive(filePath) {
  try {
    const info = await getArchiveInfo(filePath);
    return info.isValid;
  } catch {
    return false;
  }
}

/**
 * 获取压缩包信息
 */
export async function getArchiveInfo(filePath) {
  try {
    // 使用 -t 命令测试压缩包完整性并获取详细信息
    // 添加 -p"" 提供空密码，让加密文件快速报错而不等待交互
    const output = await _7z.cmd(['t', filePath, '-slt', '-p""']);

    // 解析 7z 输出
    const info = parseArchiveTestOutput(output);

    return {
      isValid: true,
      isEncrypted: info.isEncrypted,
      requiresPassword: false,
      format: info.format,
      totalSize: info.totalSize,
      compressedSize: info.compressedSize,
      fileCount: info.fileCount,
    };
  } catch (err) {
    const errorMsg = err.message || err.toString();
    // console.warn('7z error message:', errorMsg);

    // 即使出错，也尝试解析输出中的基本信息
    let info = null;
    if (err.output || errorMsg) {
      const output = err.output || errorMsg;
      info = parseArchiveTestOutput(output);
    }

    // 检查是否为密码错误
    if (
      errorMsg.includes('Wrong password') ||
      errorMsg.includes('Enter password') ||
      errorMsg.includes('Cannot open encrypted archive') ||
      errorMsg.includes('Data Error in encrypted file') ||
      errorMsg.includes('Data error')
    ) {
      return {
        isValid: true,
        isEncrypted: true,
        requiresPassword: true,
        format: info ? info.format : 'UNKNOWN',
        totalSize: info ? info.totalSize : 0,
        compressedSize: info ? info.compressedSize : 0,
        fileCount: info ? info.fileCount : 0,
      };
    }

    return {
      isValid: false,
      error: errorMsg,
      format: info ? info.format : 'UNKNOWN',
      compressedSize: info ? info.compressedSize : 0,
    };
  }
}

/**
 * 解析 7z test 命令的输出
 */
function parseArchiveTestOutput(output) {
  const lines = output.split('\n');
  const info = {
    format: 'UNKNOWN',
    isEncrypted: false,
    totalSize: 0,
    compressedSize: 0,
    fileCount: 0,
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // 提取压缩包格式: "Type = zip"
    if (trimmed.startsWith('Type = ')) {
      info.format = trimmed.split(' = ')[1].toUpperCase();
    }

    // 提取物理大小: "Physical Size = 337"
    if (trimmed.startsWith('Physical Size = ')) {
      info.compressedSize = parseInt(trimmed.split(' = ')[1]) || 0;
    }

    // 检查是否加密 - 通常出现在错误输出中
    if (trimmed.includes('encrypted') || trimmed.includes('Wrong password')) {
      info.isEncrypted = true;
    }

    // 提取文件数量: "Files: 2"
    if (trimmed.startsWith('Files: ')) {
      info.fileCount = parseInt(trimmed.split(': ')[1]) || 0;
    }

    // 提取原始大小: "Size:       55"
    if (trimmed.startsWith('Size:')) {
      const sizeStr = trimmed.split(':')[1].trim();
      info.totalSize = parseInt(sizeStr) || 0;
    }

    // 提取压缩大小: "Compressed: 337" (如果没有Physical Size的话)
    if (trimmed.startsWith('Compressed:') && info.compressedSize === 0) {
      const compressedStr = trimmed.split(':')[1].trim();
      info.compressedSize = parseInt(compressedStr) || 0;
    }
  }

  return info;
}

/**
 * 解压压缩包到指定目录
 */
export async function extractArchive(
  archivePath,
  outputDir,
  password = null,
  options = {}
) {
  const startTime = Date.now();

  // 确保输出目录存在
  await fs.mkdir(outputDir, { recursive: true });

  // 进度回调设置
  const progressCallback = options.onProgress;
  let progressInterval;
  let lastProgress = 0;

  // 如果提供了回调，启动进度模拟
  if (progressCallback) {
    progressInterval = setInterval(() => {
      lastProgress = Math.min(lastProgress + Math.random() * 10, 90);
      progressCallback(Math.floor(lastProgress));
    }, 500);
  }

  try {
    let output;

    if (password) {
      // 使用 cmd 方法执行带密码的解压命令
      const extractCommand = [
        'x',
        archivePath,
        '-o' + outputDir,
        '-p' + password,
        '-y',
      ];
      output = await _7z.cmd(extractCommand);
    } else {
      // 即使没有密码，也使用 cmd 方法并提供空密码，避免交互等待
      const extractCommand = [
        'x',
        archivePath,
        '-o' + outputDir,
        '-p""',
        '-y',
      ];
      output = await _7z.cmd(extractCommand);
    }

    // 最终进度更新
    if (progressCallback) {
      progressCallback(100);
    }

    return {
      success: true,
      duration: (Date.now() - startTime) / 1000,
      outputPath: outputDir,
      output: output, // 7z 命令的输出信息
    };
  } catch (err) {
    const errorMessage = err.message || err.toString();

    // 检查密码错误
    if (
      errorMessage.includes('Wrong password') ||
      errorMessage.includes('Enter password') ||
      errorMessage.includes('Cannot open encrypted archive') ||
      errorMessage.includes('Data error in encrypted file')
    ) {
      throw new Error(`密码错误: ${errorMessage}`);
    }

    throw new Error(`解压失败: ${errorMessage}`);
  } finally {
    // 清理进度定时器
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

// 默认导出，保持向后兼容
export default {
  isArchive,
  getArchiveInfo,
  extractArchive,
};
