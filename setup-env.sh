#!/bin/bash
# 配置MIMO API环境变量

echo "=================================="
echo "  配置 MIMO API 环境变量"
echo "=================================="
echo ""

# 创建.env文件
cat > .env << 'EOF'
# MIMO API 环境变量配置
# 使用官方Anthropic SDK连接方式

# API端点（必须）
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic

# API Key（必须）
ANTHROPIC_AUTH_TOKEN=你的API Key

# 模型名称
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
EOF

echo "✓ 已创建 .env 文件"
echo ""
echo "请编辑 .env 文件，填入你的API Key:"
echo ""
echo "  nano .env"
echo ""
echo "或使用以下命令直接设置环境变量:"
echo ""
echo "  export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic"
echo "  export ANTHROPIC_AUTH_TOKEN=你的API Key"
echo "  export ANTHROPIC_MODEL=mimo-v2.5-pro"
echo "  export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro"
echo "  export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro"
echo "  export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro"
echo ""
echo "=================================="
echo "  配置完成"
echo "=================================="
