const chalk = require('chalk');
const inquirer = require('inquirer');
const {
  addPassword,
  removePassword,
  getAllPasswords,
  clearAllPasswords
} = require('../utils/passwordStore');

/**
 * Password management command handler
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
    console.error(chalk.red('❌ Password management error:'), error.message);
    process.exit(1);
  }
}

/**
 * Check if any password-related option is provided
 */
function hasAnyPasswordOption(options) {
  return options.add || options.delete || options.clear || options.list;
}

/**
 * Interactive password management interface
 */
async function interactivePasswordManager() {
  console.log(chalk.cyan('🔐 Password Library Manager'));
  console.log('');
  
  const choices = [
    { name: '📝 Add new password', value: 'add' },
    { name: '📋 List all passwords', value: 'list' },
    { name: '🗑️  Delete password', value: 'delete' },
    { name: '🧹 Clear all passwords', value: 'clear' },
    { name: '❌ Exit', value: 'exit' }
  ];
  
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);
    
    if (action === 'exit') {
      break;
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
 * Add a password to the library
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
 * Prompt for password to add
 */
async function promptAddPassword() {
  const questions = [
    {
      type: 'password',
      name: 'password',
      message: 'Enter password to add:',
      mask: '*'
    },
    {
      type: 'input',
      name: 'label',
      message: 'Enter optional label (press Enter to skip):',
      default: ''
    }
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
 * Delete a password from the library
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
 * Prompt for password to delete
 */
async function promptDeletePassword() {
  const passwords = getAllPasswords();
  
  if (passwords.length === 0) {
    console.log(chalk.yellow('⚠️  No passwords stored yet'));
    return;
  }
  
  const choices = passwords.map(p => ({
    name: `${maskPassword(p.value)} ${p.label ? `(${p.label})` : ''} - Used ${p.usageCount} times`,
    value: p.value
  }));
  
  const { passwordToDelete } = await inquirer.prompt([
    {
      type: 'list',
      name: 'passwordToDelete',
      message: 'Select password to delete:',
      choices
    }
  ]);
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to delete this password?`,
      default: false
    }
  ]);
  
  if (confirm) {
    await handleDeletePassword(passwordToDelete);
  }
}

/**
 * Clear all passwords from the library
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
 * Prompt for confirmation before clearing all passwords
 */
async function promptClearAllPasswords() {
  const passwords = getAllPasswords();
  
  if (passwords.length === 0) {
    console.log(chalk.yellow('⚠️  No passwords stored yet'));
    return;
  }
  
  console.log(chalk.yellow(`⚠️  This will delete ${passwords.length} stored passwords`));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to clear all passwords?',
      default: false
    }
  ]);
  
  if (confirm) {
    await handleClearAllPasswords();
  }
}

/**
 * List all stored passwords (masked)
 */
async function handleListPasswords() {
  const passwords = getAllPasswords();
  
  if (passwords.length === 0) {
    console.log(chalk.yellow('⚠️  No passwords stored yet'));
    return;
  }
  
  console.log(chalk.blue('📋 Stored Passwords:'));
  console.log('');
  
  passwords.forEach((p, index) => {
    const maskedPassword = maskPassword(p.value);
    const label = p.label ? chalk.gray(`(${p.label})`) : '';
    const usage = chalk.gray(`Used: ${p.usageCount} times`);
    const added = chalk.gray(`Added: ${new Date(p.addedAt).toLocaleDateString()}`);
    
    console.log(`${index + 1}. ${chalk.cyan(maskedPassword)} ${label}`);
    console.log(`   ${usage}, ${added}`);
  });
}

/**
 * Mask password for display purposes
 */
function maskPassword(password) {
  if (!password || password.length === 0) {
    return '';
  }
  
  if (password.length <= 2) {
    return '*'.repeat(password.length);
  }
  
  return password[0] + '*'.repeat(password.length - 2) + password[password.length - 1];
}

module.exports = passwordCommand;