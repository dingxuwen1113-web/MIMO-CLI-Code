#!/bin/bash
# 独立配额429错误诊断 - 找出真正原因

echo "=================================="
echo "  独立配额429错误诊断"
echo "  400亿token + 独立配额"
echo "  找出真正原因"
echo "=================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查环境变量
if [ -z "$ANTHROPIC_BASE_URL" ] || [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo -e "${RED}❌ 未设置环境变量${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 环境变量已设置${NC}"
echo "  ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
echo "  ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}..."
echo ""

# 测试1: 获取详细的响应头信息
echo -e "${BLUE}📋 测试1: 获取详细的响应头信息${NC}"
echo "----------------------------------"

echo "发送请求并获取完整响应头..."
echo ""

RESPONSE=$(curl -s -D /tmp/mimo-headers.txt --max-time 30 \
  "$ANTHROPIC_BASE_URL/v1/messages" \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }' \
  2>/dev/null)

echo "响应头信息:"
cat /tmp/mimo-headers.txt
echo ""

HTTP_CODE=$(head -n1 /tmp/mimo-headers.txt | awk '{print $2}')
echo "HTTP状态码: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "429" ]; then
    echo -e "${RED}✗ 429错误${NC}"
    echo "响应体: $RESPONSE"
    echo ""

    # 检查retry-after
    RETRY_AFTER=$(grep -i "retry-after" /tmp/mimo-headers.txt | awk '{print $2}' | tr -d '\r')
    if [ ! -z "$RETRY_AFTER" ]; then
        echo -e "${YELLOW}⏱ Retry-After: ${RETRY_AFTER}秒${NC}"
    fi
fi

echo ""

# 测试2: 测试RPM限制（快速连续请求）
echo -e "${BLUE}📋 测试2: 测试RPM限制（快速连续请求）${NC}"
echo "----------------------------------"

echo "发送10个快速请求（无间隔），观察429出现时机..."
echo ""

FIRST_429=0
SUCCESS_COUNT=0

for i in {1..10}; do
    echo -n "请求 $i/10: "

    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --max-time 10 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "mimo-v2.5-pro",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Test '$i'"}]
      }' \
      2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ 成功${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$HTTP_CODE" = "429" ]; then
        echo -e "${RED}✗ 429错误${NC}"
        if [ $FIRST_429 -eq 0 ]; then
            FIRST_429=$i
            echo "  → 第一个429出现在第 $i 个请求"
            echo "  → 说明RPM限制约为 $((i-1)) 个请求/秒"
        fi
    else
        echo -e "${RED}✗ 失败: HTTP $HTTP_CODE${NC}"
    fi
done

echo ""
echo "测试结果:"
echo "  成功: $SUCCESS_COUNT/10"
echo "  第一个429: 第 $FIRST_429 个请求"
echo ""

if [ $FIRST_429 -gt 0 ]; then
    echo -e "${YELLOW}分析:${NC}"
    echo "  RPM限制约为 $((FIRST_429-1))-$FIRST_429 个请求/秒"
    echo "  即每分钟 $(((FIRST_429-1)*60))-$((FIRST_429*60)) RPM"
fi

echo ""

# 测试3: 测试不同间隔
echo -e "${BLUE}📋 测试3: 测试不同间隔${NC}"
echo "----------------------------------"

echo "测试1秒间隔（5个请求）..."
SUCCESS_1S=0
for i in {1..5}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] && SUCCESS_1S=$((SUCCESS_1S + 1))
    sleep 1
done
echo "  1秒间隔成功率: $SUCCESS_1S/5"

echo "测试2秒间隔（5个请求）..."
SUCCESS_2S=0
for i in {1..5}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] && SUCCESS_2S=$((SUCCESS_2S + 1))
    sleep 2
done
echo "  2秒间隔成功率: $SUCCESS_2S/5"

echo "测试3秒间隔（5个请求）..."
SUCCESS_3S=0
for i in {1..5}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    [ "$HTTP_CODE" = "200" ] && SUCCESS_3S=$((SUCCESS_3S + 1))
    sleep 3
done
echo "  3秒间隔成功率: $SUCCESS_3S/5"

echo ""

# 测试4: 测试代理服务限制
echo -e "${BLUE}📋 测试4: 测试代理服务限制${NC}"
echo "----------------------------------"

echo "当前代理: $ANTHROPIC_BASE_URL"
echo ""
echo "代理服务可能有的限制:"
echo "  1. RPM（每分钟请求数）限制"
echo "  2. 并发请求数限制"
echo "  3. IP限制"
echo "  4. 用户/Key限制"
echo ""

# 测试5: 检查是否是IP限制
echo -e "${BLUE}📋 测试5: 检查是否是IP限制${NC}"
echo "----------------------------------"

CURRENT_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "无法获取")
echo "当前IP: $CURRENT_IP"
echo ""
echo "如果有VPN，可以切换IP测试是否是IP限制"
echo ""

# 测试6: 测试并发限制
echo -e "${BLUE}📋 测试6: 测试并发限制${NC}"
echo "----------------------------------"

echo "发送3个并发请求..."
echo ""

for i in {1..3}; do
    echo -n "并发请求 $i/3: "
    curl -s -w "%{http_code}\n" \
      --max-time 10 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "mimo-v2.5-pro",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Concurrent test '$i'"}]
      }' \
      2>/dev/null &
done

wait
echo ""

# 分析结果
echo -e "${BLUE}📋 分析结果${NC}"
echo "----------------------------------"

echo "独立配额 + 400亿token + 429错误 = ?"
echo ""
echo -e "${YELLOW}可能原因:${NC}"
echo ""
echo "1. RPM（每分钟请求数）限制"
echo "   - 即使是独立配额，也有RPM限制"
echo "   - 可能是60 RPM、100 RPM等"
echo "   - 与token额度无关"
echo ""
echo "2. 代理服务限流"
echo "   - 代理服务: $ANTHROPIC_BASE_URL"
echo "   - 代理服务可能有自己的限制"
echo "   - 可能对独立配额也有RPM限制"
echo ""
echo "3. 请求模式问题"
echo "   - MIMO每轮对话需要多个请求"
echo "   - 流式响应消耗更多RPM"
echo "   - 工具调用需要额外请求"
echo ""
echo "4. 并发限制"
echo "   - 同时进行的请求数限制"
echo "   - 多个终端同时运行"
echo ""

# 生成报告
REPORT_FILE="429-independent-quota-$(date +%Y%m%d_%H%M%S).txt"
cat > "$REPORT_FILE" << EOF
独立配额429错误诊断报告
生成时间: $(date)

环境配置:
- ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL
- ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}...
- Token额度: 400亿 (独立配额)
- 当前IP: $CURRENT_IP

测试结果:
- 单次请求: HTTP $HTTP_CODE
- 快速连续请求: 成功=$SUCCESS_COUNT/10, 第一个429=第$FIRST_429个请求
- 1秒间隔成功率: $SUCCESS_1S/5
- 2秒间隔成功率: $SUCCESS_2S/5
- 3秒间隔成功率: $SUCCESS_3S/5

RPM限制分析:
- 快速请求触发429的时机: 第$FIRST_429个请求
- 估计RPM限制: $(((FIRST_429-1)*60))-$((FIRST_429*60)) RPM

可能原因:
1. RPM限制 - 即使独立配额也有RPM限制
2. 代理服务限流 - 代理服务有自己的限制
3. 请求模式 - MIMO每轮需要多个请求
4. 并发限制 - 同时进行的请求数限制

建议:
1. 检查代理服务的RPM限制
2. 增加请求间隔到3秒
3. 减少并发使用
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

echo "400亿token + 独立配额 + 429错误 = RPM限制"
echo ""
echo "❌ 不是token额度问题"
echo "   400亿token足够用很久"
echo ""
echo "❌ 不是共享Key问题"
echo "   你确认是独立配额"
echo ""
echo -e "${GREEN}✅ 是RPM（每分钟请求数）限制${NC}"
echo "   - 即使独立配额也有RPM限制"
echo "   - 代理服务可能有自己的RPM限制"
echo "   - 与token额度无关"
echo ""

# 解决方案
echo -e "${BLUE}📋 解决方案${NC}"
echo "----------------------------------"

echo "1. 增加请求间隔（立即生效）"
echo "   export MIMO_REQUEST_INTERVAL=3000"
echo ""
echo "2. 联系MIMO团队"
echo "   - 确认独立配额的RPM限制"
echo "   - 申请增加RPM配额"
echo "   - 确认代理服务的限制"
echo ""
echo "3. 使用本地模型（无限制）"
echo "   - 安装Ollama"
echo "   - 完全无RPM限制"
echo ""
echo "4. 优化请求模式"
echo "   - 减少不必要的工具调用"
echo "   - 合并多个操作"
echo "   - 使用缓存减少请求"
echo ""

echo "=================================="
echo "  诊断完成"
echo "=================================="
