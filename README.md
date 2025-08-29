# ZP - Cross-Platform Archive Extraction Tool

[![npm version](https://badge.fury.io/js/%40yton%2Fzp.svg)](https://www.npmjs.com/package/@yton/zp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful CLI tool for batch extraction of archive files with advanced features including multi-password support, recursive extraction, and merged file detection. Works on Windows, macOS, and Linux.

## 🚀 Features

- **🗂️ Batch Processing** - Extract multiple archives simultaneously
- **🔐 Multi-Password Support** - Try multiple passwords automatically
- **🔄 Recursive Extraction** - Handle nested archives seamlessly
- **📦 Multi-Volume Support** - Process split archives (.001, .part1.rar, etc.)
- **🖼️ Merged File Detection** - Extract archives hidden in images/videos
- **📊 Progress Tracking** - Real-time progress bars and statistics
- **💾 Password Library** - Store and manage frequently used passwords
- **🎨 Colorful Interface** - Rich CLI output with clear status indicators
- **🌍 Cross-Platform** - Works on Windows, macOS, and Linux

## 📋 Requirements

- **Node.js** >= 14.0.0
- **7-Zip** must be installed:
  - **Windows**: [Download from 7-zip.org](https://www.7-zip.org)
  - **macOS**: `brew install p7zip` or download from official site
  - **Linux**: `sudo apt install p7zip-full` (Ubuntu/Debian) or equivalent

## 📦 Installation

```bash
# Install globally via npm
npm install -g @yton/zp

# Verify installation
zp --version
```

## 🔧 Usage

### Basic Extraction

```bash
# Extract all archives in current directory
zp .

# Extract with specific passwords
zp /path/to/archives -p password1 -p password2

# Extract to specific output directory
zp ./downloads -d ./extracted

# Keep original files after extraction
zp ./archives -k
```

### Password Management

```bash
# Interactive password manager
zp pwd

# Add password to library
zp pwd -a mypassword

# List stored passwords (masked)
zp pwd --list

# Clear all stored passwords
zp pwd --clear
```

### Advanced Options

```bash
# Force detection of merged files (images/videos + archives)
zp . --detect-merged

# Keep carrier files when extracting merged archives
zp . --keep-carrier

# Verbose output
zp ./archives -v

# Disable colored output
zp ./archives --no-color
```

## 📸 Interface Preview

### Scanning Phase

```
🔍 正在扫描压缩文件...
✓ 发现 4 个压缩文件

┌─────────────────────────────────────────────────────────┐
│ 文件名                    格式      大小      路径       │
├─────────────────────────────────────────────────────────┤
│ 📦 archive.rar           RAR       125MB     ./         │
│ 📦 data.zip             ZIP       45MB      ./folder/  │
│ 📦 movie.001-003        7Z[分卷]  2.1GB     ./downloads/│
│ 📦 disguised.jpg        RAR[拼接] 89MB      ./temp/    │
└─────────────────────────────────────────────────────────┘
```

### Extraction Progress

```
📦 archive.rar
├─ 🔐 尝试密码: ****
├─ ⏳ 解压中... [████████░░] 80%
└─ ✓ 解压成功 (耗时: 2.3s)

📦 movie.jpg [拼接:JPG+RAR]
├─ 📸 载体: movie.jpg (2.5MB)
├─ 📦 数据: hidden.rar (156MB)
├─ 🔐 使用密码库密码
└─ ✓ 解压成功 (载体文件已保留)
```

## 🎯 Supported Formats

- **ZIP** - .zip, .jar, .war, .ear
- **RAR** - .rar
- **7-Zip** - .7z
- **TAR** - .tar, .tar.gz, .tar.bz2, .tar.xz
- **Other** - .gz, .bz2, .xz, .iso
- **Multi-volume** - .001, .002, .part1.rar, .z01, etc.
- **Merged files** - Archives attached to images/videos

## ⚙️ Configuration

Configuration file location:

- **Windows**: `%APPDATA%\.zp\config.json`
- **macOS/Linux**: `~/.zp/config.json`

```json
{
  "version": "1.0.0",
  "passwords": [
    {
      "value": "password123",
      "addedAt": "2024-01-01T00:00:00Z",
      "usageCount": 5,
      "label": "work password"
    }
  ],
  "preferences": {
    "confirmDelete": true,
    "showProgress": true,
    "maxConcurrent": 3,
    "tempDir": "/tmp/zp"
  }
}
```

## 🚨 Error Handling

| Error Code | Description        | Solution                                        |
| ---------- | ------------------ | ----------------------------------------------- |
| E001       | 7-Zip not found    | Install 7-Zip from official website             |
| E002       | Invalid path       | Check path exists and is accessible             |
| E003       | No archives found  | Ensure archives exist in specified path         |
| E004       | Extraction failed  | Try different passwords or check file integrity |
| E005       | Missing volume     | Ensure all volume files are present             |
| E006       | Corrupted file     | File may be damaged or incomplete               |
| E007       | Insufficient space | Free up disk space                              |

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/yton/zp.git
cd zp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Project Structure

```
zp/
├── bin/
│   └── zp.js              # CLI entry point
├── src/
│   ├── commands/          # Command implementations
│   ├── utils/             # Utility functions
│   ├── core/              # Core extraction logic
│   └── ui/                # User interface components
├── test/                  # Test files
└── package.json
```

## 📖 API Reference

The tool is designed as a CLI application, but core modules can be imported:

```javascript
const { checkSystemRequirements } = require('@yton/zp/src/utils/system');
const { ZPError, ErrorCodes } = require('@yton/zp/src/core/errors');
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **7-Zip** - The core extraction engine
- **Commander.js** - CLI framework
- **Inquirer.js** - Interactive prompts
- **Chalk** - Terminal colors

## 🔗 Links

- [GitHub Repository](https://github.com/yton/zp)
- [NPM Package](https://www.npmjs.com/package/@yton/zp)
- [Issue Tracker](https://github.com/yton/zp/issues)
- [7-Zip Official Site](https://www.7-zip.org)

---

**⚡ Made with ❤️ for efficient archive management on Windows**
