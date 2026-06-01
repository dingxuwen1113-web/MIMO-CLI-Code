#!/bin/bash
# 重新初始化MIMO配置
# 使用 mimo init 命令重新配置API

echo "=================================="
echo "  重新初始化 MIMO 配置"
echo "=================================="
echo ""
echo "当前配置:"
cat ~/.mimo/config.toml | head -15
echo ""
echo "正在运行 mimo init..."
echo ""

# 运行 mimo init
node dist/index.js init

echo ""
echo "=================================="
echo "  配置完成"
echo "=================================="
echo ""
echo "如果仍有问题，请检查:"
echo "  1. API Key是否正确"
echo "  2. 网络连接是否正常"
echo "  3. API服务是否可用"
echo ""
echo "测试连接:"
echo "  ./test-mimo-api.sh"
