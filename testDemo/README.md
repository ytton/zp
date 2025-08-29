# ZP 测试场景目录

这个目录包含了各种测试场景的压缩文件，用于测试 ZP 工具的功能。

## 目录结构

### 1. simple/ - 简单压缩包
- 无密码的基础压缩文件
- 用于测试基本解压功能

### 2. password/ - 密码保护压缩包
- 需要密码的压缩文件
- 测试密码：`test123`
- 用于测试密码尝试功能

### 3. nested/ - 嵌套压缩包
- 压缩包内包含其他压缩包
- 用于测试递归解压功能

### 4. multipart/ - 分卷压缩包
- 分成多个部分的压缩文件
- 用于测试分卷文件处理

### 5. disguised/ - 伪装压缩包
- 扩展名被修改的压缩文件（如 .txt 实际是 .zip）
- 用于测试文件类型检测功能

## 使用方法

```bash
# 测试所有场景
zp testDemo -p test123

# 测试单个场景
zp testDemo/simple
zp testDemo/password -p test123
zp testDemo/nested -r
zp testDemo/multipart
zp testDemo/disguised
```

## 创建测试文件

由于无法直接创建二进制压缩文件，请按以下步骤手动创建测试文件：

### 1. 简单压缩包 (simple/)
```bash
cd testDemo/simple
echo "这是一个简单的测试文件" > test.txt
7z a simple.zip test.txt
rm test.txt
```

### 2. 密码保护压缩包 (password/)
```bash
cd testDemo/password
echo "这是一个需要密码的文件" > secret.txt
7z a -ptest123 encrypted.zip secret.txt
rm secret.txt
```

### 3. 嵌套压缩包 (nested/)
```bash
cd testDemo/nested
echo "最内层的文件" > content.txt
7z a inner.zip content.txt
7z a outer.zip inner.zip
rm content.txt inner.zip
```

### 4. 分卷压缩包 (multipart/)
```bash
cd testDemo/multipart
# 创建一个较大的测试文件
dd if=/dev/zero of=bigfile.bin bs=1M count=10
7z a -v2m multipart.7z bigfile.bin
rm bigfile.bin
```

### 5. 伪装压缩包 (disguised/)
```bash
cd testDemo/disguised
echo "这是一个伪装的压缩文件" > hidden.txt
7z a disguised.zip hidden.txt
mv disguised.zip disguised.txt
rm hidden.txt
