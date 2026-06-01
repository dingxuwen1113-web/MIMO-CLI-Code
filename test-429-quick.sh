#!/bin/bash
# 快速测试429问题

echo "=================================="
echo "  快速测试429问题"
echo "=================================="
echo ""

# 检查环境变量
if [ -z "$ANTHROPIC_BASE_URL" ] || [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo "❌ 未设置环境变量"
    echo ""
    echo "请先设置:"
    echo "  export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic"
    echo "  export ANTHROPIC_AUTH_TOKEN=你的API Key"
    echo "  export ANTHROPIC_MODEL=mimo-v2.5-pro"
    exit 1
fi

echo "✓ 环境变量已设置"
echo "  ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
echo "  ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}..."
echo ""

# 测试1: 单次请求
echo "📋 测试1: 单次请求"
echo "----------------------------------"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  --max-time 30 \
  "$ANTHROPIC_BASE_URL/v1/messages" \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "'$ANTHROPIC_MODEL'",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }' \
  2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ 成功"
    echo "响应: $(echo $BODY | jq -r '.content[0].text' 2>/dev/null || echo $BODY | head -c 100)"
elif [ "$HTTP_CODE" = "429" ]; then
    echo "✗ 429错误"
    echo "响应: $BODY"
else
    echo "✗ 失败: HTTP $HTTP_CODE"
fi

echo ""

# 测试2: 连续请求（1秒间隔）
echo "📋 测试2: 连续请求（1秒间隔）"
echo "----------------------------------"

for i in {1..3}; do
    echo -n "请求 $i/3: "

    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --max-time 30 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "'$ANTHROPIC_MODEL'",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Test '$i'"}]
      }' \
      2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo "✓ 成功"
    elif [ "$HTTP_CODE" = "429" ]; then
        echo "✗ 429错误"
    else
        echo "✗ 失败: HTTP $HTTP_CODE"
    fi

    sleep 1
done

echo ""

# 测试3: 连续请求（2秒间隔）
echo "📋 测试3: 连续请求（2秒间隔）"
echo "----------------------------------"

for i in {1..3}; do
    echo -n "请求 $i/3: "

    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --max-time 30 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "'$ANTHROPIC_MODEL'",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Test '$i'"}]
      }' \
      2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo "✓ 成功"
    elif [ "$HTTP_CODE" = "429" ]; then
        echo "✗ 429错误"
    else
        echo "✗ 失败: HTTP $HTTP_CODE"
    fi

    sleep 2
done

echo ""

# 分析结果
echo "📋 分析结果"
echo "----------------------------------"

echo "如果测试2出现429错误，测试3成功，说明:"
echo "  ✅ 问题是请求过于频繁"
echo "  ✅ 解决方案: 增加请求间隔到2-3秒"
echo ""
echo "如果测试2和测试3都出现429错误，说明:"
echo "  ✅ 问题是共享Key的RPM限制"
echo "  ✅ 解决方案: 申请专属API Key"
echo ""
echo "如果所有测试都成功，说明:"
echo "  ✅ 当前配置正常"
echo "  ✅ 429错误可能是高峰期问题"
echo ""

# 提供解决方案
echo "📋 解决方案"
echo "----------------------------------"

echo "立即解决:"
echo "  export MIMO_REQUEST_INTERVAL=3000"
echo ""
echo "长期解决:"
echo "  1. 申请专属API Key"
echo "  2. 使用本地模型（Ollama）"
echo ""
echo "查看详细分析:"
echo "  ./diagnose-429.sh"
echo ""
echo "=================================="
echo "  测试完成"
echo "=================================="
