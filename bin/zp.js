#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import extractCommand from '../src/commands/extract.js';
import passwordCommand from '../src/commands/password.js';

// Use createRequire to import package.json
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

async function main() {
  try {
    // Check system requirements first

    program
      .name('zp')
      .description(
        '批量压缩文件解压工具，支持多密码尝试'
      )
      .version(version)
      .showSuggestionAfterError(true)
      .showHelpAfterError('(使用 zp -h 查看帮助信息)');

    // 主解压命令
    program
      .argument('<path>', '扫描路径（使用 . 表示当前目录）')
      .option(
        '-p, --password <password>',
        '解压密码（可多次指定）',
        []
      )
      .option('-d, --destination <dir>', '输出目录', '.')
      .option('-r, --recursive', '递归解压嵌套压缩包', true)
      .option(
        '-k, --keep',
        '保留原始压缩文件（跳过删除确认）',
        false
      )
      .option('--no-color', '禁用彩色输出')
      .option('-v, --verbose', '显示详细日志')
      .option(
        '--detect-merged',
        '强制检测拼接文件（图片/视频附加压缩包）'
      )
      .option(
        '--keep-carrier',
        '解压拼接文件时保留载体文件'
      )
      .action(extractCommand);

    // 密码管理子命令
    program
      .command('pwd')
      .description('管理密码库')
      .option('-a, --add <password>', '添加密码到密码库')
      .option('-d, --delete <password>', '从密码库删除密码')
      .option('--clear', '清空所有密码')
      .option('--list', '列出所有密码（遮罩显示）')
      .action(passwordCommand);

    await program.parseAsync();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// ESM equivalent of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
