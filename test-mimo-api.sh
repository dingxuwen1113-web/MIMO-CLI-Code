#!/bin/bash
# 测试新的MiMo API连接

echo "=================================="
echo "  测试 MiMo API 连接"
echo "=================================="
echo ""
echo "API端点: https://api.xiaomimimo.com/v1/chat/completions"
echo "认证方式: api-key header"
echo ""

# 从配置文件读取API Key
API_KEY=$(grep -A 5 "\[api.tokenPlan\]" ~/.mimo/config.toml | grep "apiKey" | cut -d'"' -f2)

if [ -z "$API_KEY" ]; then
    echo "❌ 未找到API Key"
    echo "请检查 ~/.mimo/config.toml"
    exit 1
fi

echo "API Key: ${API_KEY:0:20}..."
echo ""

# 测试连接
echo "测试连接..."
echo ""

response=$(curl -s -w "\n%{http_code}" --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
  --header "api-key: $API_KEY" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, this is a test message. Please respond briefly."
      }
    ],
    "model": "mimo-v2.5-pro",
    "max_completion_tokens": 100,
    "temperature": 0.7,
    "stream": false
  }' \
  --max-time 30 \
  2>/dev/null)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

echo "HTTP状态码: $http_code"
echo ""

if [ "$http_code" = "200" ]; then
    echo "✅ 连接成功！"
    echo ""

    # 解析响应
    if command -v jq &> /dev/null; then
        echo "响应内容:"
        echo "$body" | jq -r '.choices[0].message.content' 2>/dev/null || echo "$body"
        echo ""
        echo "Token使用:"
        echo "$body" | jq '.usage' 2>/dev/null || echo "无法解析"
    else
        echo "响应内容:"
        echo "$body" | head -c 500
        echo ""
        echo ""
        echo "提示: 安装 jq 可以更好地解析JSON"
        echo "  macOS: brew install jq"
        echo "  Ubuntu: sudo apt-get install jq"
    fi
else
    echo "❌ 连接失败"
    echo ""
    echo "响应:"
    echo "$body" | head -c 500
    echo ""
    echo ""

    if [ "$http_code" = "429" ]; then
        echo "⚠️  429错误：请求过于频繁"
        echo "请稍后再试"
    elif [ "$http_code" = "401" ]; then
        echo "⚠️  401错误：API Key无效"
        echo "请检查API Key"
    elif [ "$http_code" = "403" ]; then
        echo "⚠️  403错误：访问被拒绝"
        echo "请检查API Key权限"
    elif [ "$http_code" = "000" ]; then
        echo "⚠️  连接超时或无法访问"
        echo "请检查网络连接"
    fi
fi

echo ""
echo "=================================="
echo "  测试完成"
echo "=================================="
