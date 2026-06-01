#!/bin/bash
# 一键配置并启动MIMO

echo "=================================="
echo "  MIMO 一键配置和启动"
echo "=================================="
echo ""

# 检查是否已设置环境变量
if [ -z "$ANTHROPIC_BASE_URL" ] || [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo "⚠ 未检测到环境变量，正在配置..."
    echo ""

    # 创建.env文件
    cat > .env << 'EOF'
# MIMO API 环境变量配置
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
ANTHROPIC_AUTH_TOKEN=你的API Key
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
EOF

    echo "✓ 已创建 .env 文件"
    echo ""
    echo "请编辑 .env 文件填入你的API Key:"
    echo "  nano .env"
    echo ""
    echo "或直接设置环境变量:"
    echo "  export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic"
    echo "  export ANTHROPIC_AUTH_TOKEN=你的API Key"
    echo ""
    echo "然后重新运行此脚本"
    exit 1
fi

echo "✓ 环境变量已配置"
echo "  ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
echo "  ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}..."
echo "  ANTHROPIC_MODEL: $ANTHROPIC_MODEL"
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

# 测试API连接
echo "正在测试API连接..."
response=$(curl -s -w "\n%{http_code}" --max-time 10 \
  "$ANTHROPIC_BASE_URL/v1/messages" \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }' \
  2>/dev/null || echo "000\nConnection failed")

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "200" ]; then
    echo "✓ API连接成功"
else
    echo "❌ API连接失败 (HTTP $http_code)"
    echo ""
    echo "请检查:"
    echo "  1. API Key是否正确"
    echo "  2. 网络连接是否正常"
    echo "  3. API端点是否可达"
    exit 1
fi

echo ""
echo "=================================="
echo "  启动 MIMO CLI"
echo "=================================="
echo ""
npm run dev
