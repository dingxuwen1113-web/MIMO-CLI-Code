#!/bin/bash
# 深度诊断429错误 - 找出真正原因

echo "=================================="
echo "  深度诊断429错误"
echo "  400亿token额度，找出真正原因"
echo "=================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查环境变量
echo -e "${BLUE}📋 步骤1: 检查环境变量${NC}"
echo "----------------------------------"

if [ -z "$ANTHROPIC_BASE_URL" ]; then
    echo -e "${RED}✗ ANTHROPIC_BASE_URL 未设置${NC}"
    BASE_URL="https://token-plan-sgp.xiaomimimo.com/anthropic"
else
    echo -e "${GREEN}✓ ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL${NC}"
    BASE_URL="$ANTHROPIC_BASE_URL"
fi

if [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo -e "${RED}✗ ANTHROPIC_AUTH_TOKEN 未设置${NC}"
    exit 1
else
    echo -e "${GREEN}✓ ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}...${NC}"
    API_KEY="$ANTHROPIC_AUTH_TOKEN"
fi

echo ""

# 测试1: 检查响应头中的限流信息
echo -e "${BLUE}📋 步骤2: 检查响应头中的限流信息${NC}"
echo "----------------------------------"

echo "发送请求并检查响应头..."
echo ""

RESPONSE=$(curl -s -D - --max-time 30 \
  "$BASE_URL/v1/messages" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }' \
  2>/dev/null)

# 分离响应头和响应体
HEADERS=$(echo "$RESPONSE" | head -n 20)
BODY=$(echo "$RESPONSE" | tail -n 1)

echo "响应头信息:"
echo "$HEADERS" | grep -i "x-ratelimit\|retry-after\|x-request\|x-anthropic" || echo "未找到限流相关头信息"
echo ""

# 检查是否是429
HTTP_CODE=$(echo "$HEADERS" | head -n1 | awk '{print $2}')
echo "HTTP状态码: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "429" ]; then
    echo -e "${RED}✗ 429错误${NC}"
    echo "响应体: $BODY"
    echo ""

    # 分析retry-after
    RETRY_AFTER=$(echo "$HEADERS" | grep -i "retry-after" | awk '{print $2}' | tr -d '\r')
    if [ ! -z "$RETRY_AFTER" ]; then
        echo -e "${YELLOW}⏱ Retry-After: ${RETRY_AFTER}秒${NC}"
        echo "建议等待 $RETRY_AFTER 秒后重试"
    fi
fi

echo ""

# 测试2: 快速连续请求（测试RPM限制）
echo -e "${BLUE}📋 步骤3: 快速连续请求测试（测试RPM限制）${NC}"
echo "----------------------------------"

echo "发送5个快速请求（无间隔），观察429出现时机..."
echo ""

for i in {1..5}; do
    echo -n "请求 $i/5: "

    START_TIME=$(date +%s%N)
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --max-time 10 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "mimo-v2.5-pro",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Test '$i'"}]
      }' \
      2>/dev/null)
    END_TIME=$(date +%s%N)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ 成功 (${DURATION}ms)${NC}"
    elif [ "$HTTP_CODE" = "429" ]; then
        echo -e "${RED}✗ 429错误 (${DURATION}ms)${NC}"
        echo "  → 在第 $i 个请求出现429"
        echo "  → 说明RPM限制在 $((i-1))-$i 个请求/秒"
    else
        echo -e "${RED}✗ 失败: HTTP $HTTP_CODE (${DURATION}ms)${NC}"
    fi
done

echo ""

# 测试3: 测试不同间隔
echo -e "${BLUE}📋 步骤4: 测试不同间隔${NC}"
echo "----------------------------------"

echo "测试1秒间隔..."
SUCCESS_1S=0
for i in {1..3}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] && SUCCESS_1S=$((SUCCESS_1S + 1))
    sleep 1
done
echo "  1秒间隔成功率: $SUCCESS_1S/3"

echo "测试2秒间隔..."
SUCCESS_2S=0
for i in {1..3}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] && SUCCESS_2S=$((SUCCESS_2S + 1))
    sleep 2
done
echo "  2秒间隔成功率: $SUCCESS_2S/3"

echo "测试3秒间隔..."
SUCCESS_3S=0
for i in {1..3}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] && SUCCESS_3S=$((SUCCESS_3S + 1))
    sleep 3
done
echo "  3秒间隔成功率: $SUCCESS_3S/3"

echo ""

# 测试4: 检查是否是IP限制
echo -e "${BLUE}📋 步骤5: 检查是否是IP限制${NC}"
echo "----------------------------------"

echo "获取当前IP..."
CURRENT_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "无法获取")
echo "当前IP: $CURRENT_IP"
echo ""

echo "测试不同IP（如果可能）..."
echo "提示: 如果有VPN，可以切换IP测试"
echo ""

# 测试5: 检查是否是用户/Key限制
echo -e "${BLUE}📋 步骤6: 检查是否是用户/Key限制${NC}"
echo "----------------------------------"

echo "当前API Key: ${API_KEY:0:20}..."
echo ""
echo "如果这是共享Key，可能是:"
echo "  1. 所有用户共用RPM限制"
echo "  2. 用户数量过多导致RPM紧张"
echo "  3. 代理服务对共享Key有额外限制"
echo ""

# 测试6: 检查代理服务
echo -e "${BLUE}📋 步骤7: 检查代理服务${NC}"
echo "----------------------------------"

echo "当前使用代理: $BASE_URL"
echo ""
echo "代理服务可能有:"
echo "  1. 自己的RPM限制"
echo "  2. IP限制"
echo "  3. 用户限制"
echo "  4. 并发限制"
echo ""

# 生成诊断报告
REPORT_FILE="429-deep-diagnosis-$(date +%Y%m%d_%H%M%S).txt"
cat > "$REPORT_FILE" << EOF
MIMO 429错误深度诊断报告
生成时间: $(date)

环境配置:
- ANTHROPIC_BASE_URL: $BASE_URL
- ANTHROPIC_AUTH_TOKEN: ${API_KEY:0:20}...
- Token额度: 400亿 (不是额度问题)
- 当前IP: $CURRENT_IP

测试结果:
- 单次请求: HTTP $HTTP_CODE
- 1秒间隔成功率: $SUCCESS_1S/3
- 2秒间隔成功率: $SUCCESS_2S/3
- 3秒间隔成功率: $SUCCESS_3S/3

429出现时机: 第 $i 个请求

可能原因分析:
1. RPM（每分钟请求数）限制 - 最可能
   - 共享Key的RPM被所有用户分摊
   - 用户越多，每用户可用RPM越少
   - 400亿token额度 ≠ RPM额度

2. 代理服务限流
   - 代理服务可能有自己的限制
   - 可能对共享Key有额外限制

3. IP限制
   - 同一IP的请求频率限制
   - 与token额度无关

4. 并发限制
   - 同时进行的请求数限制
   - 与token额度无关

建议:
1. 申请专属API Key（独立RPM配额）
2. 增加请求间隔到3秒
3. 使用本地模型（无限制）
4. 联系MIMO团队确认RPM限制
EOF

echo ""
echo -e "${BLUE}📋 诊断报告${NC}"
echo "----------------------------------"
echo "📄 报告已保存到: $REPORT_FILE"
echo ""

# 总结
echo -e "${BLUE}📋 总结${NC}"
echo "----------------------------------"

echo "400亿token额度，但仍然429，说明:"
echo ""
echo "❌ 不是token额度问题"
echo "   400亿token远超正常使用"
echo ""
echo "✅ 最可能是RPM（每分钟请求数）限制"
echo "   - Token额度 ≠ RPM额度"
echo "   - 共享Key的RPM被所有用户分摊"
echo "   - 用户越多，每用户可用RPM越少"
echo ""
echo "✅ 可能是代理服务限流"
echo "   - 代理服务可能有自己的限制"
echo "   - 可能对共享Key有额外限制"
echo ""
echo "✅ 可能是IP/并发限制"
echo "   - 与token额度无关"
echo "   - 基于请求频率的限制"
echo ""

# 解决方案
echo -e "${BLUE}📋 解决方案${NC}"
echo "----------------------------------"

echo "1. 申请专属API Key（最佳）"
echo "   - 获得独立的RPM配额"
echo "   - 不受其他用户影响"
echo ""
echo "2. 增加请求间隔"
echo "   export MIMO_REQUEST_INTERVAL=3000"
echo ""
echo "3. 使用本地模型"
echo "   - 安装Ollama"
echo "   - 完全无限制"
echo ""
echo "4. 联系MIMO团队"
echo "   - 确认RPM限制"
echo "   - 申请增加配额"
echo ""

echo "=================================="
echo "  诊断完成"
echo "=================================="
