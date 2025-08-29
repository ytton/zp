# ZP - Cross-Platform Archive Extraction Tool

This is a Node.js CLI tool that performs batch extraction of archive files with advanced features, supporting Windows, macOS, and Linux.

## Development Commands

```bash
# Development
npm run dev          # Start development server with nodemon
npm start           # Run the CLI tool directly
npm test            # Run Jest tests
npm run lint        # Run ESLint

# Testing the CLI
node bin/zp.js . -p test123    # Test basic extraction
node bin/zp.js pwd --list      # Test password management
```

## Project Structure

```
zp/
├── bin/
│   └── zp.js              # CLI entry point
├── src/
│   ├── commands/          # Command implementations
│   │   ├── extract.js     # Main extraction command
│   │   └── password.js    # Password management command
│   ├── utils/             # Utility functions
│   │   ├── system.js      # System requirements check
│   │   ├── fileScanner.js # Archive file discovery
│   │   ├── passwordStore.js # Password storage/encryption
│   │   └── pathUtils.js   # Path handling utilities
│   ├── core/              # Core extraction logic
│   │   ├── extractor.js   # Main extraction engine
│   │   ├── detector.js    # Archive format detection
│   │   ├── volumeHandler.js # Multi-volume archive handling
│   │   └── mergedFileHandler.js # Merged file detection/extraction
│   └── ui/                # User interface components
│       ├── progress.js    # Progress bars and status
│       ├── table.js       # File listing tables
│       └── prompts.js     # Interactive prompts
├── test/                  # Test files
└── package.json
```

## Key Features Being Implemented

1. **7-Zip Integration** - Requires 7-Zip installation on Windows
2. **Multi-Password Support** - Try multiple passwords in sequence
3. **Recursive Extraction** - Handle nested archives automatically
4. **Multi-Volume Support** - Handle split/volume archives (.001, .part1.rar, etc.)
5. **Merged File Detection** - Extract archives hidden in images/videos
6. **Interactive UI** - Progress bars, colored output, confirmations
7. **Password Library** - Store and manage frequently used passwords

## Development Notes

- Target platforms: Windows, macOS, Linux (Node.js >=14)
- Primary dependency: 7-Zip must be installed
- Windows: Registry check `HKEY_LOCAL_MACHINE\\SOFTWARE\\7-Zip` or standard paths
- macOS: Homebrew `/opt/homebrew/bin/7z`, MacPorts `/opt/local/bin/7z`, or standard paths
- Linux: Standard system paths `/usr/bin/7z`, `/usr/local/bin/7z`
- Temp directory: `%TEMP%\\zp` (Windows) or `/tmp/zp` (Unix)
- Config location: `%APPDATA%\\.zp\\config.json` (Windows) or `~/.zp/config.json` (Unix)

## Error Codes

- E001: NO_7ZIP - 7-Zip not installed
- E002: INVALID_PATH - Invalid scan path
- E003: NO_ARCHIVES - No archives found
- E004: EXTRACTION_FAILED - Extraction failed
- E005: MISSING_VOLUME - Missing volume file
- E006: CORRUPTED_FILE - Corrupted archive
- E007: INSUFFICIENT_SPACE - Not enough disk space

## Testing Scenarios

1. Single archive extraction (with/without password)
2. Multi-volume archive extraction
3. Nested archive extraction (archive within archive)
4. Merged file detection (image+archive, video+archive)
5. Password library management
6. Error handling (missing 7-Zip, corrupted files, etc.)

## 开发进度 (Development Progress)

### 已完成 (Completed) ✅

1. **项目结构搭建** - 完整的 Node.js CLI 项目架构
   - CLI 入口点和命令行参数解析 (Commander.js)
   - 模块化代码结构 (commands/, utils/, core/, ui/)
   - 依赖管理和配置文件

2. **跨平台 7-Zip 集成** - 支持 Windows、macOS、Linux
   - 自动检测 7-Zip 安装路径
   - 跨平台命令执行和错误处理
   - 命令构建和参数解析优化

3. **文件扫描器** - 递归查找压缩文件
   - 支持多种压缩格式识别 (.zip, .rar, .7z, .tar, .gz, etc.)
   - 分卷文件检测和分组 (.001, .part1.rar, .z01, etc.)
   - 伪装文件检测 (大文件非标准扩展名)

4. **核心提取引擎** - 单文件和批量提取
   - 7z 命令封装和输出解析
   - 文件提取状态监控
   - 错误分类和处理

5. **密码尝试机制** - 多密码自动测试
   - 无密码优先尝试
   - 存储密码按使用频率排序
   - 密码使用统计和更新

6. **密码库管理** - 明文存储 (按需求简化)
   - 增删改查 CRUD 操作
   - JSON 配置文件存储
   - 交互式和命令行管理界面

7. **用户界面优化** - 进度显示和状态反馈
   - 彩色表格显示扫描结果
   - 实时提取进度条
   - 密码尝试状态显示
   - 最终结果汇总报告

### 当前阶段 (Current Phase) 🔄

**核心功能验证和优化** - 所有基础功能已完成并可正常工作

- ✅ 单文件提取测试通过
- ✅ 文件解析逻辑修复 (7z 17.05 兼容)
- ✅ 命令参数解析优化 (spawn + quoted paths)
- ✅ 调试输出清理完成

### 待实现功能 (Pending Features) 📋

1. **嵌套压缩文件处理** - 当前有基础实现但需优化
   - 递归提取逻辑完善
   - 嵌套层级限制
   - 循环检测和防护

2. **多分卷文件支持** - 基础检测已完成，需完整实现
   - 分卷完整性检查
   - 缺失分卷提示
   - 自动分卷合并

3. **拼接文件检测** - 最后实现 (按用户要求)
   - 图片+压缩文件检测
   - 视频+压缩文件检测
   - 二进制特征分析
   - 载体文件分离

4. **高级功能优化**
   - 大文件进度优化
   - 内存使用优化
   - 并发提取支持
   - 更详细的错误报告

### 测试覆盖 (Test Coverage) 🧪

**已测试场景:**

- ✅ 7z 格式单文件提取
- ✅ ZIP 格式单文件提取
- ✅ 无密码文件处理
- ✅ 密码保护 ZIP 文件提取
- ✅ 密码保护 7z 文件提取
- ✅ 多密码自动尝试机制
- ✅ 密码库集成和使用统计
- ✅ 跨平台 7-Zip 检测 (macOS)
- ✅ 文件扫描和识别
- ✅ 用户界面显示和进度反馈

**待测试场景:**

- 🔄 RAR 格式支持 (依赖7z引擎)
- 🔄 分卷文件处理
- 🔄 嵌套文件提取
- 🔄 大文件处理性能
- 🔄 边缘错误场景处理

### 密码处理增强 🔐

**新增功能:**

- ✅ 智能密码错误检测 - 支持多种7z输出格式
- ✅ ZIP格式密码提示检测 (`Enter password`)
- ✅ 7z格式加密错误检测 (`Data Error in encrypted file`)
- ✅ exec 和 spawn 双模式密码检测
- ✅ 60秒提取超时防止卡死
- ✅ 错误详情结构化存储

## Current Phase: Advanced Feature Development 🚀

核心功能已完成并通过全面测试，包括密码保护文件的自动处理。系统已准备好进行高级功能开发。
