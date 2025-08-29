import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  isArchive,
  getArchiveInfo,
  extractArchive,
} from '../src/core/sevenZip.js';

describe('sevenZip 功能测试', () => {
  let testDir;
  let testZipFile;
  let testPasswordZipFile;
  let testExtractDir;
  const testPassword = 'test123';

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(os.tmpdir(), 'sevenzip-test');
    testExtractDir = path.join(testDir, 'extracted');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testExtractDir, { recursive: true });

    // 创建一个简单的测试文件
    const testFile1 = path.join(testDir, 'test1.txt');
    const testFile2 = path.join(testDir, 'test2.txt');

    await fs.writeFile(testFile1, '这是测试文件1的内容');
    await fs.writeFile(testFile2, 'This is test file 2 content');

    // 使用 7zip-min 创建测试压缩包
    const _7z = await import('7zip-min');
    testZipFile = path.join(testDir, 'test.zip');
    testPasswordZipFile = path.join(testDir, 'test-password.zip');

    try {
      // 创建无密码压缩包
      await _7z.default.pack(testDir + '/*.txt', testZipFile);
      console.log('创建测试压缩包成功:', testZipFile);

      // 创建带密码的压缩包
      await _7z.default.cmd([
        'a',
        testPasswordZipFile,
        testDir + '/*.txt',
        '-p' + testPassword,
      ]);
      console.log('创建带密码压缩包成功:', testPasswordZipFile);
    } catch (err) {
      console.error('创建测试压缩包失败:', err.message);
      throw err;
    }
  });

  afterAll(async () => {
    // 清理测试文件
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('清理测试文件失败:', err.message);
    }
  });

  test('isArchive - 检查有效压缩包', async () => {
    const result = await isArchive(testZipFile);
    expect(result).toBe(true);
  });

  test('isArchive - 检查无效文件', async () => {
    const invalidFile = path.join(testDir, 'test1.txt');
    const result = await isArchive(invalidFile);
    expect(result).toBe(false);
  });

  test('isArchive - 检查不存在的文件', async () => {
    const nonExistentFile = path.join(testDir, 'nonexistent.zip');
    const result = await isArchive(nonExistentFile);
    expect(result).toBe(false);
  });

  test('getArchiveInfo - 获取压缩包信息', async () => {
    const info = await getArchiveInfo(testZipFile);

    expect(info.isValid).toBe(true);
    expect(info.isEncrypted).toBe(false);
    expect(info.requiresPassword).toBe(false);
    expect(info.format).toBe('ZIP');
    expect(info.fileCount).toBeGreaterThan(0);
    expect(info.totalSize).toBeGreaterThan(0);

    console.log('无密码压缩包信息:', info);
  });

  test('getArchiveInfo - 获取带密码压缩包信息', async () => {
    const info = await getArchiveInfo(testPasswordZipFile);

    expect(info.isValid).toBe(true);
    expect(info.isEncrypted).toBe(true);
    expect(info.requiresPassword).toBe(true);

    console.log('带密码压缩包信息:', info);
  });

  test('isArchive - 检查带密码的压缩包', async () => {
    const result = await isArchive(testPasswordZipFile);
    expect(result).toBe(true);
  });

  test('getArchiveInfo - 处理不存在的文件', async () => {
    const nonExistentFile = path.join(testDir, 'nonexistent.zip');
    const info = await getArchiveInfo(nonExistentFile);

    expect(info.isValid).toBe(false);
    expect(info.error).toBeDefined();
  });

  test('extractArchive - 解压压缩包', async () => {
    const outputDir = path.join(testExtractDir, 'test-output');

    const result = await extractArchive(testZipFile, outputDir);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputDir);
    expect(result.duration).toBeGreaterThan(0);

    // 检查解压出的文件是否存在
    const extractedFile1 = path.join(outputDir, 'test1.txt');
    const extractedFile2 = path.join(outputDir, 'test2.txt');

    const file1Exists = await fs
      .access(extractedFile1)
      .then(() => true)
      .catch(() => false);
    const file2Exists = await fs
      .access(extractedFile2)
      .then(() => true)
      .catch(() => false);

    expect(file1Exists).toBe(true);
    expect(file2Exists).toBe(true);

    // 检查文件内容
    const content1 = await fs.readFile(extractedFile1, 'utf8');
    const content2 = await fs.readFile(extractedFile2, 'utf8');

    expect(content1).toBe('这是测试文件1的内容');
    expect(content2).toBe('This is test file 2 content');

    console.log('解压结果:', result);
  });

  test('extractArchive - 解压带密码的压缩包', async () => {
    const outputDir = path.join(testExtractDir, 'password-output');

    const result = await extractArchive(
      testPasswordZipFile,
      outputDir,
      testPassword
    );

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(outputDir);
    expect(result.duration).toBeGreaterThan(0);

    // 检查解压出的文件是否存在
    const extractedFile1 = path.join(outputDir, 'test1.txt');
    const extractedFile2 = path.join(outputDir, 'test2.txt');

    const file1Exists = await fs
      .access(extractedFile1)
      .then(() => true)
      .catch(() => false);
    const file2Exists = await fs
      .access(extractedFile2)
      .then(() => true)
      .catch(() => false);

    expect(file1Exists).toBe(true);
    expect(file2Exists).toBe(true);

    // 检查文件内容
    const content1 = await fs.readFile(extractedFile1, 'utf8');
    const content2 = await fs.readFile(extractedFile2, 'utf8');

    expect(content1).toBe('这是测试文件1的内容');
    expect(content2).toBe('This is test file 2 content');

    console.log('带密码解压结果:', result);
  });

  test('extractArchive - 错误密码测试', async () => {
    const outputDir = path.join(testExtractDir, 'wrong-password-test');

    await expect(
      extractArchive(testPasswordZipFile, outputDir, 'wrongpassword')
    ).rejects.toThrow('密码错误');
  });

  test('extractArchive - 无密码解压加密文件测试', async () => {
    const outputDir = path.join(testExtractDir, 'no-password-test');

    await expect(
      extractArchive(testPasswordZipFile, outputDir, null)
    ).rejects.toThrow('密码错误');
  });

  test('extractArchive - 进度回调测试', async () => {
    const outputDir = path.join(testExtractDir, 'progress-test');
    const progressUpdates = [];

    const result = await extractArchive(testZipFile, outputDir, null, {
      onProgress: progress => {
        progressUpdates.push(progress);
      },
    });

    expect(result.success).toBe(true);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);

    console.log('进度更新次数:', progressUpdates.length);
    console.log(
      '进度值:',
      progressUpdates.slice(0, 5),
      '...',
      progressUpdates.slice(-3)
    );
  });

  test('extractArchive - 错误处理 - 不存在的文件', async () => {
    const nonExistentFile = path.join(testDir, 'nonexistent.zip');
    const outputDir = path.join(testExtractDir, 'error-test');

    await expect(extractArchive(nonExistentFile, outputDir)).rejects.toThrow(
      '解压失败'
    );
  });
});
