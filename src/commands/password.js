import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  addPassword,
  removePassword,
  getAllPasswords,
  clearAllPasswords,
} from '../utils/passwordStore.js';

/**
 * 密码管理命令处理器
 */
async function passwordCommand(options) {
  try {
    // If no options provided, start interactive mode
    if (!hasAnyPasswordOption(options)) {
      await interactivePasswordManager();
      return;
    }

    // Handle specific password operations
    if (options.add) {
      await handleAddPassword(options.add);
    }

    if (options.delete) {
      await handleDeletePassword(options.delete);
    }

    if (options.clear) {
      await handleClearAllPasswords();
    }

    if (options.list) {
      await handleListPasswords();
    }
  } catch (error) {
    console.error(chalk.red('❌ 密码管理错误:'), error.message);
    process.exit(1);
  }
}

/**
 * 检查是否提供了任何密码相关选项
 */
function hasAnyPasswordOption(options) {
  return options.add || options.delete || options.clear || options.list;
}

/**
 * 交互式密码管理界面
 */
async function interactivePasswordManager() {
  console.log(chalk.cyan('🔐 密码库管理器'));
  console.log('');

  const choices = [
    { name: '📝 添加新密码', value: 'add' },
    { name: '📋 列出所有密码', value: 'list' },
    { name: '🗑️  删除密码', value: 'delete' },
    { name: '🧹 清空所有密码', value: 'clear' },
    { name: '❌ 退出', value: 'exit' },
  ];

  let shouldContinue = true;

  while (shouldContinue) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作:',
        choices,
      },
    ]);

    if (action === 'exit') {
      shouldContinue = false;
      continue;
    }

    switch (action) {
    case 'add':
      await promptAddPassword();
      break;
    case 'list':
      await handleListPasswords();
      break;
    case 'delete':
      await promptDeletePassword();
      break;
    case 'clear':
      await promptClearAllPasswords();
      break;
    }

    console.log('');
  }
}

/**
 * 添加密码到密码库
 */
async function handleAddPassword(password) {
  const result = addPassword(password);
  if (result.success) {
    console.log(chalk.green('✓'), result.message);
  } else {
    console.log(chalk.yellow('⚠️ '), result.message);
  }
}

/**
 * 提示输入要添加的密码
 */
async function promptAddPassword() {
  const questions = [
    {
      type: 'password',
      name: 'password',
      message: '请输入要添加的密码:',
      mask: '*',
    },
    {
      type: 'input',
      name: 'label',
      message: '请输入可选标签 (按回车跳过):',
      default: '',
    },
  ];

  const { password, label } = await inquirer.prompt(questions);

  if (password) {
    const result = addPassword(password, label);
    if (result.success) {
      console.log(chalk.green('✓'), result.message);
    } else {
      console.log(chalk.yellow('⚠️ '), result.message);
    }
  }
}

/**
 * 从密码库删除密码
 */
async function handleDeletePassword(password) {
  const result = removePassword(password);
  if (result.success) {
    console.log(chalk.green('✓'), result.message);
  } else {
    console.log(chalk.yellow('⚠️ '), result.message);
  }
}

/**
 * 提示选择要删除的密码
 */
async function promptDeletePassword() {
  const passwords = getAllPasswords();

  if (passwords.length === 0) {
    console.log(chalk.yellow('⚠️  还没有存储任何密码'));
    return;
  }

  const choices = passwords.map(p => ({
    name: `${maskPassword(p.value)} ${p.label ? `(${p.label})` : ''} - 使用 ${p.usageCount} 次`,
    value: p.value,
  }));

  const { passwordToDelete } = await inquirer.prompt([
    {
      type: 'list',
      name: 'passwordToDelete',
      message: '请选择要删除的密码:',
      choices,
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '确定要删除这个密码吗?',
      default: false,
    },
  ]);

  if (confirm) {
    await handleDeletePassword(passwordToDelete);
  }
}

/**
 * 清空密码库中的所有密码
 */
async function handleClearAllPasswords() {
  const result = clearAllPasswords();
  if (result.success) {
    console.log(chalk.green('✓'), result.message);
  } else {
    console.log(chalk.red('❌'), result.message);
  }
}

/**
 * 清空所有密码前的确认提示
 */
async function promptClearAllPasswords() {
  const passwords = getAllPasswords();

  if (passwords.length === 0) {
    console.log(chalk.yellow('⚠️  还没有存储任何密码'));
    return;
  }

  console.log(
    chalk.yellow(`⚠️  这将删除 ${passwords.length} 个存储的密码`)
  );

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '确定要清空所有密码吗?',
      default: false,
    },
  ]);

  if (confirm) {
    await handleClearAllPasswords();
  }
}

/**
 * 列出所有存储的密码（遮罩显示）
 */
async function handleListPasswords() {
  const passwords = getAllPasswords();

  if (passwords.length === 0) {
    console.log(chalk.yellow('⚠️  还没有存储任何密码'));
    return;
  }

  console.log(chalk.blue('📋 存储的密码:'));
  console.log('');

  passwords.forEach((p, index) => {
    const label = p.label ? chalk.gray(`(${p.label})`) : '';
    const usage = chalk.gray(`使用: ${p.usageCount} 次`);
    const added = chalk.gray(
      `添加: ${new Date(p.addedAt).toLocaleDateString()}`
    );

    console.log(`${index + 1}. ${chalk.cyan(p.value)} ${label}`);
    console.log(`   ${usage}, ${added}`);
  });
}

/**
 * 遮罩密码用于显示
 */
function maskPassword(password) {
  if (!password || password.length === 0) {
    return '';
  }

  if (password.length <= 2) {
    return '*'.repeat(password.length);
  }

  return (
    password[0] +
    '*'.repeat(password.length - 2) +
    password[password.length - 1]
  );
}

export default passwordCommand;
