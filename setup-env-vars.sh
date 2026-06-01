#!/bin/bash
# 配置MIMO API - 使用官方环境变量方式

echo "=================================="
echo "  配置 MIMO API 连接"
echo "=================================="
echo ""
echo "使用官方环境变量配置方式:"
echo ""
echo "  ANTHROPIC_BASE_URL - API端点"
echo "  ANTHROPIC_AUTH_TOKEN - API Key"
echo "  ANTHROPIC_MODEL - 模型名称"
echo ""

# 创建环境变量配置文件
cat > ~/.mimo/.env << 'EOF'
# MIMO API 配置
# 使用官方环境变量方式

# API端点
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic

# API Key (从MIMO控制台获取)
ANTHROPIC_AUTH_TOKEN=你的API Key

# 模型名称
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
EOF

echo "✓ 已创建环境变量配置文件: ~/.mimo/.env"
echo ""
echo "请编辑配置文件，填入你的API Key:"
echo "  nano ~/.mimo/.env"
echo ""
echo "或使用以下命令设置环境变量:"
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
