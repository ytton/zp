#!/usr/bin/env node

const { program } = require('commander');
const { version } = require('../package.json');
const extractCommand = require('../src/commands/extract');
const passwordCommand = require('../src/commands/password');
const { checkSystemRequirements } = require('../src/utils/system');

async function main() {
  try {
    // Check system requirements first
    await checkSystemRequirements();

    program
      .name('zp')
      .description('Windows batch archive extraction tool with multi-password support')
      .version(version);

    // Main extraction command
    program
      .argument('<path>', 'scan path (use . for current directory)')
      .option('-p, --password <password>', 'extraction password (can be specified multiple times)', [])
      .option('-d, --destination <dir>', 'output directory', '.')
      .option('-r, --recursive', 'recursively extract nested archives', true)
      .option('-k, --keep', 'keep original archive files (skip deletion confirmation)', false)
      .option('--no-color', 'disable colored output')
      .option('-v, --verbose', 'show verbose logs')
      .option('--detect-merged', 'force detection of merged files (images/videos with attached archives)')
      .option('--keep-carrier', 'keep carrier files when extracting merged archives')
      .action(extractCommand);

    // Password management subcommand
    program
      .command('pwd')
      .description('manage password library')
      .option('-a, --add <password>', 'add password to library')
      .option('-d, --delete <password>', 'delete password from library')
      .option('--clear', 'clear all passwords')
      .option('--list', 'list all passwords (masked)')
      .action(passwordCommand);

    await program.parseAsync();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };