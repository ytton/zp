#!/bin/bash

# 创建测试压缩文件的脚本
# 使用前请确保已安装 7z 命令

echo "开始创建测试文件..."

# 1. 创建简单压缩包
echo "创建简单压缩包..."
cd simple
echo "这是一个简单的测试文件" > test.txt
echo "另一个测试文件" > test2.txt
7z a simple.zip test.txt test2.txt
rm test.txt test2.txt
cd ..

# 2. 创建密码保护压缩包
echo "创建密码保护压缩包..."
cd password
echo "这是一个需要密码的文件" > secret.txt
echo "机密内容" > confidential.txt
7z a -ptest123 encrypted.zip secret.txt confidential.txt
rm secret.txt confidential.txt
cd ..

# 3. 创建嵌套压缩包
echo "创建嵌套压缩包..."
cd nested
echo "最内层的文件" > content.txt
echo "另一个内层文件" > data.txt
7z a inner.zip content.txt data.txt
7z a middle.7z inner.zip
7z a outer.zip middle.7z
rm content.txt data.txt inner.zip middle.7z
cd ..

# 4. 创建分卷压缩包
echo "创建分卷压缩包..."
cd multipart
# 创建一个较大的测试文件
echo "创建测试数据..."
for i in {1..1000}; do
    echo "这是第 $i 行测试数据，用于创建分卷压缩包" >> bigfile.txt
done
7z a -v1m multipart.7z bigfile.txt
rm bigfile.txt
cd ..

# 5. 创建伪装压缩包
echo "创建伪装压缩包..."
cd disguised
echo "这是一个伪装的压缩文件" > hidden.txt
echo "隐藏的内容" > secret_data.txt
7z a disguised.zip hidden.txt secret_data.txt
# 伪装成文本文件
mv disguised.zip disguised.txt
# 再创建一个伪装成图片的压缩包
7z a fake_image.zip hidden.txt
mv fake_image.zip fake_image.jpg
rm hidden.txt secret_data.txt
cd ..

echo "测试文件创建完成！"
echo ""
echo "测试命令示例："
echo "  zp testDemo/simple"
echo "  zp testDemo/password -p test123"
echo "  zp testDemo/nested -r"
echo "  zp testDemo/multipart"
echo "  zp testDemo/disguised"
