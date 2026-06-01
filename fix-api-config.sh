#!/bin/bash
# 一键修复API配置问题

echo "=================================="
echo "  一键修复 API 配置"
echo "=================================="
echo ""

# 步骤1: 备份当前配置
echo "步骤1: 备份当前配置..."
if [ -f ~/.mimo/config.toml ]; then
    cp ~/.mimo/config.toml ~/.mimo/config.toml.backup
    echo "✓ 已备份到: ~/.mimo/config.toml.backup"
else
    echo "⚠ 未找到配置文件"
fi
echo ""

# 步骤2: 创建正确的配置
echo "步骤2: 创建正确的配置..."
mkdir -p ~/.mimo

cat > ~/.mimo/config.toml << 'EOF'
# MIMO CLI 配置文件
# Token Plan 模式

[api]
mode = "token-plan"
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
maxTokensPerTurn = 32768

[agent]
mode = "yolo"
maxTurns = 50
autoApproveReads = true

[promptCaching]
enabled = true
cacheTtl = 300

[features]
enabled = true
disabledFeatures = []
EOF

echo "✓ 已创建配置文件"
echo ""

# 步骤3: 验证配置
echo "步骤3: 验证配置..."
if [ -f ~/.mimo/config.toml ]; then
    echo "✓ 配置文件存在"
    echo ""
    echo "配置内容:"
    cat ~/.mimo/config.toml
else
    echo "✗ 配置文件创建失败"
    exit 1
fi
echo ""

# 步骤4: 测试API连接
echo "步骤4: 测试API连接..."
echo ""

# 提取API Key
API_KEY=$(grep -A 5 "\[api.tokenPlan\]" ~/.mimo/config.toml | grep "apiKey" | cut -d'"' -f2)

if [ -z "$API_KEY" ]; then
    echo "✗ 未找到API Key"
    exit 1
fi

echo "API Key: ${API_KEY:0:20}..."
echo ""

# 测试连接
response=$(curl -s -w "\n%{http_code}" --max-time 10 \
  "https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }' \
  2>/dev/null || echo "000\nConnection failed")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

echo "HTTP状态码: $http_code"
echo ""

if [ "$http_code" = "200" ]; then
    echo "✅ API连接成功！"
    echo ""
    echo "响应:"
    echo "$body" | head -c 200
    echo ""
elif [ "$http_code" = "429" ]; then
    echo "⚠️  429错误: 请求过于频繁"
    echo "这是正常的，因为共享Key有限制"
    echo "请稍后再试"
elif [ "$http_code" = "401" ]; then
    echo "❌ 401错误: API Key无效"
    echo ""
    echo "可能原因:"
    echo "  1. API Key格式不正确"
    echo "  2. API Key已过期"
    echo "  3. API Key权限不足"
    echo ""
    echo "请检查API Key或获取新的API Key"
elif [ "$http_code" = "000" ]; then
    echo "❌ 连接失败"
    echo "请检查网络连接"
else
    echo "❌ 请求失败"
    echo "响应:"
    echo "$body" | head -c 200
fi

echo ""
echo "=================================="
echo "  修复完成"
echo "=================================="
echo ""
echo "下一步:"
echo "  1. 运行: npm run dev"
echo "  2. 如果仍有问题，请提供错误信息"
