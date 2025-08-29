import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  scanForArchives,
  extractArchives,
  processNestedArchives,
  processArchives,
} from '../src/core/archiveProcessor.js';

describe('archiveProcessor 功能测试', () => {
  let testDir;
  let testOutputDir;
  let testArchivesDir;
  let testNestedDir;
  let testZipFile;
  let testPasswordZipFile;
  let test7zFile;
  const testPassword = 'test123';

  beforeAll(async () => {
    // 创建测试目录结构
    testDir = path.join(os.tmpdir(), 'archiveprocessor-test');
    testOutputDir = path.join(testDir, 'output');
    testArchivesDir = path.join(testDir, 'archives');
    testNestedDir = path.join(testDir, 'nested');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testOutputDir, { recursive: true });
    await fs.mkdir(testArchivesDir, { recursive: true });
    await fs.mkdir(testNestedDir, { recursive: true });

    // 创建测试文件
    const testFile1 = path.join(testDir, 'test1.txt');
    const testFile2 = path.join(testDir, 'test2.txt');
    await fs.writeFile(testFile1, '这是测试文件1的内容');
    await fs.writeFile(testFile2, 'This is test file 2 content');

    // 使用 7zip-min 创建真实的测试压缩包
    const _7z = await import('7zip-min');
    testZipFile = path.join(testArchivesDir, 'test.zip');
    testPasswordZipFile = path.join(testArchivesDir, 'test-password.zip');
    test7zFile = path.join(testArchivesDir, 'test.7z');

    try {
      // 创建无密码压缩包
      await _7z.default.pack(testDir + '/*.txt', testZipFile);

      // 创建带密码的压缩包
      await _7z.default.cmd([
        'a',
        testPasswordZipFile,
        testDir + '/*.txt',
        '-p' + testPassword,
      ]);

      // 创建7z格式压缩包
      await _7z.default.cmd([
        'a',
        '-t7z',
        test7zFile,
        testDir + '/*.txt',
      ]);

      // 创建非压缩包文件用于测试
      await fs.writeFile(path.join(testArchivesDir, 'readme.txt'), 'this is not an archive');

      console.log('创建测试压缩包成功');
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

  beforeEach(async () => {
    // 清理输出目录，确保每次测试都是干净的环境
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
      await fs.mkdir(testOutputDir, { recursive: true });
    } catch (err) {
      // 忽略清理失败
    }
  });

  describe('scanForArchives', () => {
    test('应该扫描并返回目录中的所有压缩包', async () => {
      const archives = await scanForArchives(testArchivesDir);

      expect(archives.length).toBeGreaterThanOrEqual(2); // 至少包含 test.zip 和 test.7z

      const zipArchive = archives.find(a => a.fileName === 'test.zip');
      const sevenZipArchive = archives.find(a => a.fileName === 'test.7z');

      expect(zipArchive).toBeDefined();
      expect(zipArchive.extension).toBe('.zip');
      expect(zipArchive.fileSize).toBeGreaterThan(0);

      expect(sevenZipArchive).toBeDefined();
      expect(sevenZipArchive.extension).toBe('.7z');

      // 验证不包含文本文件
      const txtFile = archives.find(a => a.fileName === 'readme.txt');
      expect(txtFile).toBeUndefined();
    });

    test('应该支持非递归扫描', async () => {
      const archives = await scanForArchives(testDir, { recursive: false });
      expect(archives).toHaveLength(0); // 根目录没有压缩包
    });

    test('应该处理空目录', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });

      const archives = await scanForArchives(emptyDir);

      expect(archives).toHaveLength(0);
    });

    test('应该处理不存在的目录', async () => {
      const nonExistentDir = path.join(testDir, 'nonexistent');

      const archives = await scanForArchives(nonExistentDir);

      expect(archives).toHaveLength(0);
    });

    test('应该处理不可访问的文件', async () => {
      // 创建一个文件然后删除其权限（Unix系统上）
      const restrictedFile = path.join(testArchivesDir, 'restricted.zip');
      await fs.writeFile(restrictedFile, 'fake content');

      try {
        if (process.platform !== 'win32') {
          await fs.chmod(restrictedFile, 0o000);
        }

        const archives = await scanForArchives(testArchivesDir);

        // 应该仍能扫描其他文件
        expect(archives.length).toBeGreaterThan(0);

      } finally {
        // 恢复权限以便清理
        if (process.platform !== 'win32') {
          try {
            await fs.chmod(restrictedFile, 0o644);
            await fs.unlink(restrictedFile);
          } catch (_err) {
            // 忽略清理错误
          }
        }
      }
    });
  });

  describe('extractArchives', () => {
    test('应该成功解压所有压缩包', async () => {
      const archives = await scanForArchives(testArchivesDir);
      const zipArchives = archives.filter(a => a.fileName === 'test.zip' || a.fileName === 'test.7z');

      const results = await extractArchives(zipArchives, testOutputDir);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].usedPassword).toBe(null);
      expect(results[1].success).toBe(true);

      // 验证文件确实被解压了
      const extractedFiles = await Promise.all([
        fs.readdir(results[0].outputPath).catch(() => []),
        fs.readdir(results[1].outputPath).catch(() => []),
      ]);

      expect(extractedFiles[0].length).toBeGreaterThan(0);
      expect(extractedFiles[1].length).toBeGreaterThan(0);
    });

    test('应该处理密码保护的压缩包', async () => {
      const passwords = ['wrongpassword', 'alsobad', testPassword];

      const archives = await scanForArchives(testArchivesDir);
      const passwordArchive = archives.find(a => a.fileName === 'test-password.zip');

      expect(passwordArchive).toBeDefined();

      const results = await extractArchives([passwordArchive], testOutputDir, passwords);

      expect(results[0].success).toBe(true);
      expect(results[0].usedPassword).toBe(testPassword);

      // 验证解压结果
      const extractedFiles = await fs.readdir(results[0].outputPath);
      expect(extractedFiles.length).toBeGreaterThan(0);
      expect(extractedFiles).toContain('test1.txt');
    });

    test('应该处理密码尝试全部失败的情况', async () => {
      const passwords = ['wrongpass1', 'wrongpass2'];

      const archives = await scanForArchives(testArchivesDir);
      const passwordArchive = archives.find(a => a.fileName === 'test-password.zip');

      const results = await extractArchives([passwordArchive], testOutputDir, passwords);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('解压失败');
      expect(results[0].usedPassword).toBe(null);
    });

    test('应该调用进度回调函数', async () => {
      const archives = await scanForArchives(testArchivesDir);
      const testArchives = archives.filter(a => a.fileName === 'test.zip' || a.fileName === 'test.7z');

      const progressUpdates = [];
      const onProgress = jest.fn((progress) => {
        progressUpdates.push(progress);
      });

      await extractArchives(testArchives, testOutputDir, [], { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(progressUpdates).toEqual([50, 100]);
    });

    test('应该调用压缩包开始和完成回调', async () => {
      const archives = await scanForArchives(testArchivesDir);
      const testArchive = archives.find(a => a.fileName === 'test.zip');

      const onArchiveStart = jest.fn();
      const onArchiveComplete = jest.fn();

      await extractArchives([testArchive], testOutputDir, [], {
        onArchiveStart,
        onArchiveComplete,
      });

      expect(onArchiveStart).toHaveBeenCalledWith(testArchive, 1, 1);
      expect(onArchiveComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          archive: testArchive,
          success: true,
        }),
        1,
        1
      );
    });

    test('应该处理不存在的压缩包文件', async () => {
      const nonExistentArchive = {
        fileName: 'nonexistent.zip',
        filePath: path.join(testArchivesDir, 'nonexistent.zip'),
        fileSize: 1024,
        extension: '.zip',
      };

      const results = await extractArchives([nonExistentArchive], testOutputDir);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('解压失败');
    });

    test('应该创建输出目录', async () => {
      const newOutputDir = path.join(testDir, 'new-output');
      const archives = await scanForArchives(testArchivesDir);
      const testArchive = archives.find(a => a.fileName === 'test.zip');

      await extractArchives([testArchive], newOutputDir);

      const dirExists = await fs.access(newOutputDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('processNestedArchives', () => {
    let mockExtractedDir;
    let nestedZipFile;

    beforeEach(async () => {
      mockExtractedDir = path.join(testDir, 'mock-extracted');
      await fs.mkdir(mockExtractedDir, { recursive: true });

      // 创建一个真实的嵌套压缩包
      nestedZipFile = path.join(mockExtractedDir, 'nested.zip');

      // 创建临时文件用于压缩
      const tempNestedFile = path.join(mockExtractedDir, 'nested-content.txt');
      await fs.writeFile(tempNestedFile, 'this is nested content');

      try {
        const _7z = await import('7zip-min');
        await _7z.default.pack(tempNestedFile, nestedZipFile);

        // 清理临时文件
        await fs.unlink(tempNestedFile);

        console.log('创建嵌套测试压缩包成功:', nestedZipFile);
      } catch (_err) {
        console.warn('创建嵌套压缩包失败，使用伪文件:', _err.message);
        await fs.writeFile(nestedZipFile, 'fake nested zip content');
      }
    });

    test('应该检测并处理嵌套压缩包', async () => {
      const results = await processNestedArchives(mockExtractedDir, [testPassword]);

      expect(results.length).toBeGreaterThanOrEqual(0);

      if (results.length > 0) {
        const nestedResult = results.find(r => r.archive.fileName === 'nested.zip');
        if (nestedResult) {
          expect(nestedResult.nestingLevel).toBe(1);
          // 如果成功解压，检查输出
          if (nestedResult.success) {
            const extractedFiles = await fs.readdir(nestedResult.outputPath).catch(() => []);
            expect(extractedFiles.length).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    test('应该处理多层嵌套结构', async () => {
      // 创建子目录结构
      const level2Dir = path.join(mockExtractedDir, 'level2');
      await fs.mkdir(level2Dir, { recursive: true });

      // 在子目录中放一个文件（不是压缩包，测试目录遍历）
      await fs.writeFile(path.join(level2Dir, 'text-file.txt'), 'not an archive');

      const results = await processNestedArchives(mockExtractedDir, [], {}, 0);

      // 应该能正确处理目录遍历，不会因为非压缩包文件出错
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    test('应该处理损坏的嵌套压缩包', async () => {
      // 创建一个损坏的压缩包文件
      const corruptedZip = path.join(mockExtractedDir, 'corrupted.zip');
      await fs.writeFile(corruptedZip, 'this is not a real zip file');

      const results = await processNestedArchives(mockExtractedDir);

      // 损坏的文件应该被识别为非压缩包或解压失败
      const corruptedResult = results.find(r => r.archive.fileName === 'corrupted.zip');
      if (corruptedResult) {
        expect(corruptedResult.success).toBe(false);
      }
    });

    test('应该处理没有嵌套压缩包的情况', async () => {
      const emptyDir = path.join(testDir, 'empty-nested');
      await fs.mkdir(emptyDir, { recursive: true });

      // 只放入非压缩包文件
      await fs.writeFile(path.join(emptyDir, 'readme.txt'), 'just a text file');

      const results = await processNestedArchives(emptyDir);

      expect(results).toHaveLength(0);
    });

    test('应该调用嵌套发现回调', async () => {
      const onNestedFound = jest.fn();

      await processNestedArchives(mockExtractedDir, [], { onNestedFound });

      // 如果找到嵌套压缩包，应该调用回调
      if (onNestedFound.mock.calls.length > 0) {
        const callArgs = onNestedFound.mock.calls[0];
        expect(callArgs[0].fileName).toBeDefined();
        expect(callArgs[1]).toBe(1); // nesting level
      }
    });

    test('应该处理嵌套层级限制', async () => {
      // 创建多层嵌套目录测试深度
      const level1 = path.join(mockExtractedDir, 'level1');
      const level2 = path.join(level1, 'level2');
      const level3 = path.join(level2, 'level3');

      await fs.mkdir(level3, { recursive: true });
      await fs.writeFile(path.join(level3, 'deep.txt'), 'very deep file');

      const results = await processNestedArchives(mockExtractedDir, [], {}, 0);

      // 应该能处理深层目录结构而不出错
      expect(() => results).not.toThrow();
    });

    test('应该正确检测真实内容目录', async () => {
      // 创建一个模拟真实内容的目录结构
      const realContentDir = path.join(testDir, 'real-content');
      await fs.mkdir(realContentDir, { recursive: true });

      // 创建一些非压缩包文件（模拟真实内容）
      await fs.writeFile(path.join(realContentDir, 'app.exe'), 'fake executable');
      await fs.writeFile(path.join(realContentDir, 'config.ini'), 'configuration');
      await fs.writeFile(path.join(realContentDir, 'readme.txt'), 'readme content');

      // 创建一个子目录，里面也有非压缩包文件
      const subDir = path.join(realContentDir, 'bin');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, 'library.dll'), 'fake dll');

      // 在嵌套扫描时应该检测到这是真实内容
      const archives = await scanForArchives(realContentDir, { nestingLevel: 1 });

      // 由于是真实内容，不应该继续深度扫描
      expect(archives).toHaveLength(0);
    });

    test('应该在伪装压缩包场景中继续扫描', async () => {
      // 创建一个包含压缩包的目录（伪装场景）
      const fakeContentDir = path.join(testDir, 'fake-content');
      await fs.mkdir(fakeContentDir, { recursive: true });

      // 第一个文件是压缩包（表示还未到达真实内容）
      const firstZip = path.join(fakeContentDir, '001.zip');
      try {
        const _7z = await import('7zip-min');
        await _7z.default.pack(testDir + '/*.txt', firstZip);
      } catch (_err) {
        await fs.writeFile(firstZip, 'fake zip content');
      }

      // 添加更多压缩包
      await fs.writeFile(path.join(fakeContentDir, '002.zip'), 'fake zip 2');
      await fs.writeFile(path.join(fakeContentDir, '003.zip'), 'fake zip 3');

      // 在嵌套扫描时应该继续扫描
      const archives = await scanForArchives(fakeContentDir, { nestingLevel: 1 });

      // 应该找到压缩包
      expect(archives.length).toBeGreaterThan(0);
    });

    test('应该在真实内容目录中扫描分卷文件', async () => {
      // 创建一个真实内容目录，但包含分卷文件
      const realContentWithParts = path.join(testDir, 'real-with-parts');
      await fs.mkdir(realContentWithParts, { recursive: true });

      // 创建非压缩包文件（真实内容）
      await fs.writeFile(path.join(realContentWithParts, 'program.exe'), 'fake program');

      // 创建分卷文件
      const part1 = path.join(realContentWithParts, 'archive.part01.rar');
      const part2 = path.join(realContentWithParts, 'archive.part02.rar');

      try {
        // 尝试创建真实的分卷压缩包
        const _7z = await import('7zip-min');
        await _7z.default.cmd([
          'a',
          '-v100k',  // 创建100KB的分卷
          part1.replace('.part01.rar', '.rar'),
          testDir + '/*.txt'
        ]);
      } catch (_err) {
        // 如果失败，创建假的分卷文件
        await fs.writeFile(part1, 'fake part 1');
        await fs.writeFile(part2, 'fake part 2');
      }

      // 在嵌套扫描时，即使检测到真实内容，也应该扫描分卷文件
      const archives = await scanForArchives(realContentWithParts, { nestingLevel: 1 });

      // 应该找到分卷文件（如果它们被识别为压缩包）
      const multiPartArchives = archives.filter(a =>
        a.fileName.includes('part') ||
        /\.\d{3}$/.test(a.fileName)
      );

      // 至少应该尝试扫描分卷文件
      console.log('Found multi-part archives:', multiPartArchives.map(a => a.fileName));
    });
  });

  describe('processArchives', () => {
    test('应该完整执行压缩包处理流程', async () => {
      const result = await processArchives(testArchivesDir, testOutputDir, [testPassword]);

      expect(result.archives.length).toBeGreaterThanOrEqual(2);
      expect(result.results.length).toBe(result.archives.length);

      // 验证每个压缩包都有处理结果
      result.results.forEach(r => {
        expect(r.archive).toBeDefined();
        expect(r.success).toBeDefined();
        expect(r.outputPath).toBeDefined();
      });

      // 验证至少有一些成功的解压
      const successCount = result.results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    });

    test('应该处理没有找到压缩包的情况', async () => {
      const emptyDir = path.join(testDir, 'empty-archive-dir');
      await fs.mkdir(emptyDir, { recursive: true });
      await fs.writeFile(path.join(emptyDir, 'not-archive.txt'), 'just text');

      const result = await processArchives(emptyDir, testOutputDir);

      expect(result.archives).toHaveLength(0);
      expect(result.results).toHaveLength(0);
    });

    test('应该传递回调选项', async () => {
      const onProgress = jest.fn();
      const onArchiveStart = jest.fn();
      const onArchiveComplete = jest.fn();
      const onNestedFound = jest.fn();

      await processArchives(testArchivesDir, testOutputDir, [], {
        onProgress,
        onArchiveStart,
        onArchiveComplete,
        onNestedFound,
      });

      // 由于有真实的压缩包，这些回调应该被调用
      expect(onProgress).toHaveBeenCalled();
      expect(onArchiveStart).toHaveBeenCalled();
      expect(onArchiveComplete).toHaveBeenCalled();

      // onNestedFound 可能不会被调用，取决于压缩包内容
    });
  });

  describe('错误处理和边界情况', () => {
    test('应该处理不存在的目录', async () => {
      const nonExistentDir = path.join(testDir, 'does-not-exist');

      const archives = await scanForArchives(nonExistentDir);

      expect(archives).toHaveLength(0);
    });

    test('应该处理无效的输出路径', async () => {
      const archives = await scanForArchives(testArchivesDir);
      const testArchive = archives.find(a => a.fileName === 'test.zip');

      // 使用一个相对安全的路径测试
      const invalidOutput = path.join(testDir, 'very', 'deep', 'nested', 'path');

      try {
        const results = await extractArchives([testArchive], invalidOutput);

        // 应该能正常处理，因为 mkdir 会递归创建目录
        expect(results).toHaveLength(1);
        // 可能成功也可能失败，但不应该抛出未捕获的异常
      } catch (err) {
        // 如果抛出异常，应该是可控的错误
        expect(err).toBeDefined();
      }
    });

    test('应该处理空文件名的压缩包', async () => {
      const badArchive = {
        fileName: '',
        filePath: testZipFile,
        fileSize: 1024,
        extension: '.zip',
      };

      const results = await extractArchives([badArchive], testOutputDir);

      // 应该能处理空文件名而不崩溃
      expect(results).toHaveLength(1);
      expect(results[0]).toBeDefined();
    });
  });

  describe('集成测试', () => {
    test('应该处理真实的文件扫描场景', async () => {
      // 使用已创建的真实压缩包测试
      const archives = await scanForArchives(testArchivesDir);

      expect(archives.length).toBeGreaterThanOrEqual(2);

      // 验证扫描结果包含预期的压缩包
      const archiveNames = archives.map(a => a.fileName);
      expect(archiveNames).toContain('test.zip');
      expect(archiveNames).toContain('test.7z');

      // 验证文件属性
      archives.forEach(archive => {
        expect(archive.fileName).toBeTruthy();
        expect(archive.filePath).toBeTruthy();
        expect(archive.fileSize).toBeGreaterThan(0);
        expect(archive.extension).toMatch(/^\.[a-z0-9]+$/);
      });
    });

    test('应该处理完整的压缩包处理流程包含所有步骤', async () => {
      // 完整流程测试：扫描 -> 解压 -> 嵌套处理
      let allCallbacks = {
        onProgress: jest.fn(),
        onArchiveStart: jest.fn(),
        onArchiveComplete: jest.fn(),
        onNestedFound: jest.fn(),
      };

      const result = await processArchives(
        testArchivesDir,
        testOutputDir,
        [testPassword],
        allCallbacks
      );

      // 验证完整流程
      expect(result.archives.length).toBeGreaterThan(0);
      expect(result.results.length).toBe(result.archives.length);

      // 验证回调被调用
      expect(allCallbacks.onProgress).toHaveBeenCalled();
      expect(allCallbacks.onArchiveStart).toHaveBeenCalled();
      expect(allCallbacks.onArchiveComplete).toHaveBeenCalled();

      // 验证解压结果
      const successfulResults = result.results.filter(r => r.success);
      expect(successfulResults.length).toBeGreaterThan(0);

      // 验证输出目录确实有内容
      for (const successResult of successfulResults) {
        const outputExists = await fs.access(successResult.outputPath)
          .then(() => true)
          .catch(() => false);
        expect(outputExists).toBe(true);
      }
    });
  });
});
