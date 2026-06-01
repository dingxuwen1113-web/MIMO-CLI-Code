#!/bin/bash
# MIMO CLI 启动脚本

echo "=================================="
echo "  启动 MIMO CLI"
echo "=================================="
echo ""

# 检查是否已编译
if [ ! -d "dist" ]; then
    echo "⚠ 未找到dist目录，正在编译..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ 编译失败"
        exit 1
    fi
    echo "✓ 编译成功"
    echo ""
fi

# 启动MIMO
echo "正在启动 MIMO CLI..."
echo ""
npm run dev
