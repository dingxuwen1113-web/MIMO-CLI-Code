#!/bin/bash
# 修复并启动MIMO CLI

echo "=================================="
echo "  修复并启动 MIMO CLI"
echo "=================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 未找到package.json"
    echo "请确保在MIMO CLI项目目录中运行此脚本"
    exit 1
fi

echo "步骤1: 清理旧的构建文件..."
rm -rf dist
echo "✓ 已清理"
echo ""

echo "步骤2: 安装依赖..."
npm install
echo "✓ 依赖已安装"
echo ""

echo "步骤3: 编译项目..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ 编译失败"
    exit 1
fi
echo "✓ 编译成功"
echo ""

echo "步骤4: 启动MIMO CLI..."
echo ""
echo "使用以下命令启动:"
echo "  npm run dev"
echo ""
echo "或"
echo ""
echo "  node dist/index.js"
echo ""
echo "=================================="
echo "  修复完成"
echo "=================================="
