#!/bin/bash
# 一键切换到紧急配置

echo "切换到紧急配置..."
cp ~/.mimo/config.toml ~/.mimo/config.toml.backup
cp ~/.mimo/config-emergency.toml ~/.mimo/config.toml
echo "✓ 已切换到紧急配置"
echo ""
echo "配置说明:"
echo "  - 使用较小模型 (mimo-v2.5)"
echo "  - 禁用流式输出"
echo "  - 减少Token使用 (8192)"
echo "  - 减少最大轮数 (10)"
echo "  - 增加缓存时间 (10分钟)"
echo ""
echo "现在运行: npm run dev"
