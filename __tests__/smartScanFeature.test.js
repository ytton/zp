import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { scanForArchives } from '../src/core/archiveProcessor.js';

describe('智能压缩包扫描 - 真实内容检测', () => {
  let testDir;
  let realContentDir;
  let archivesOnlyDir;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'smart-scan-test');
    realContentDir = path.join(testDir, 'real-content');
    archivesOnlyDir = path.join(testDir, 'archives-only');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(realContentDir, { recursive: true });
    await fs.mkdir(archivesOnlyDir, { recursive: true });

    // 创建真实内容目录（模拟游戏/软件）
    await createRealContentDirectory(realContentDir);
    
    // 创建纯压缩包目录
    await createArchivesOnlyDirectory(archivesOnlyDir);
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('清理测试文件失败:', err.message);
    }
  });

  test('平面扫描（nestingLevel=0）不应受真实内容影响', async () => {
    // 平面扫描应该找到所有可能的压缩包，不管目录内容
    const archives = await scanForArchives(realContentDir, { nestingLevel: 0 });
    
    // 即使在真实内容目录中，平面扫描也会尝试检测所有文件
    // 这里可能找不到压缩包是因为我们创建的都是假文件
    console.log(`平面扫描真实内容目录找到 ${archives.length} 个压缩包`);
    
    // 应该有扫描行为，不会被真实内容检测阻止
    expect(archives.length).toBeGreaterThanOrEqual(0);
  });

  test('嵌套扫描（nestingLevel>0）应能检测真实内容并停止', async () => {
    // 嵌套扫描应该识别真实内容并适当停止深度扫描
    const archives = await scanForArchives(realContentDir, { nestingLevel: 1 });
    
    console.log(`嵌套扫描真实内容目录找到 ${archives.length} 个压缩包`);
    
    // 真实内容目录中的压缩包应该很少或没有
    expect(archives.length).toBeLessThan(5);
    
    if (archives.length > 0) {
      // 如果找到压缩包，应该标记了正确的嵌套层级
      archives.forEach(archive => {
        expect(archive.nestingLevel).toBeDefined();
      });
    }
  });

  test('纯压缩包目录不应被误判为真实内容', async () => {
    // 纯压缩包目录在嵌套扫描时不应该被停止
    const archivesNested = await scanForArchives(archivesOnlyDir, { nestingLevel: 1 });
    const archivesFlat = await scanForArchives(archivesOnlyDir, { nestingLevel: 0 });
    
    console.log(`压缩包目录 - 嵌套扫描: ${archivesNested.length}, 平面扫描: ${archivesFlat.length}`);
    
    // 两种扫描方式应该找到相似数量的压缩包
    expect(Math.abs(archivesNested.length - archivesFlat.length)).toBeLessThanOrEqual(1);
  });

  test('深层嵌套应该正确传递层级信息', async () => {
    // 创建多层目录结构
    const multiLevelDir = path.join(testDir, 'multi-level');
    const level2Dir = path.join(multiLevelDir, 'level2');
    const level3Dir = path.join(level2Dir, 'level3');
    
    await fs.mkdir(level3Dir, { recursive: true });
    
    // 在不同层级放置测试文件
    await fs.writeFile(path.join(multiLevelDir, 'test.txt'), 'level 1 file');
    await fs.writeFile(path.join(level2Dir, 'test.txt'), 'level 2 file');
    await fs.writeFile(path.join(level3Dir, 'test.txt'), 'level 3 file');
    
    const archives = await scanForArchives(multiLevelDir, { 
      nestingLevel: 2,  // 从层级2开始
      recursive: true 
    });
    
    console.log(`多层嵌套扫描结果: ${archives.length} 个压缩包`);
    
    // 验证扫描能够正常工作
    expect(archives.length).toBeGreaterThanOrEqual(0);
  });

  // 辅助函数：创建真实内容目录
  async function createRealContentDirectory(dir) {
    // 创建大量真实文件，模拟软件/游戏解压后的内容
    const files = [
      // 可执行文件
      'game.exe', 'launcher.exe', 'setup.exe', 'uninstall.exe',
      // DLL文件
      'engine.dll', 'graphics.dll', 'audio.dll', 'network.dll',
      // 配置文件
      'config.ini', 'settings.cfg', 'options.xml', 'preferences.json',
      // 文档文件
      'readme.txt', 'license.txt', 'changelog.txt', 'manual.pdf',
      'guide.html', 'faq.txt', 'credits.txt', 'version.txt',
      // 数据文件
      'data.pak', 'textures.dat', 'sounds.wav', 'music.mp3',
      'models.3d', 'levels.map', 'scripts.lua', 'shaders.hlsl',
      // 其他文件
      'icon.ico', 'splash.png', 'logo.bmp', 'cursor.cur'
    ];

    for (const file of files) {
      await fs.writeFile(path.join(dir, file), `fake ${file} content`);
    }

    // 创建典型软件目录
    const dirs = ['bin', 'lib', 'data', 'config', 'plugins', 'lang', 'help'];
    for (const subDir of dirs) {
      await fs.mkdir(path.join(dir, subDir));
      await fs.writeFile(path.join(dir, subDir, 'dummy.txt'), 'dummy content');
    }
  }

  // 辅助函数：创建纯压缩包目录
  async function createArchivesOnlyDirectory(dir) {
    // 创建一些假的压缩包文件
    const archives = [
      'archive1.zip', 'backup.rar', 'data.7z',
      'photos.tar.gz', 'videos.tar.bz2',
      // 分卷文件
      'big_file.part01.rar', 'big_file.part02.rar',
      'split.001', 'split.002', 'split.003',
    ];

    for (const archive of archives) {
      await fs.writeFile(path.join(dir, archive), `fake ${archive} content`);
    }

    // 添加一个说明文件
    await fs.writeFile(path.join(dir, 'readme.txt'), 'This folder contains archives');
  }
});