#!/bin/bash
# MIMO API 429错误诊断工具
# 分析为什么一直出现429错误

echo "=================================="
echo "  MIMO API 429错误诊断"
echo "=================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查环境变量
echo "📋 步骤1: 检查环境变量配置"
echo "----------------------------------"

if [ -z "$ANTHROPIC_BASE_URL" ]; then
    echo -e "${RED}✗ ANTHROPIC_BASE_URL 未设置${NC}"
    BASE_URL="https://token-plan-sgp.xiaomimimo.com/anthropic"
    echo "  使用默认值: $BASE_URL"
else
    echo -e "${GREEN}✓ ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL${NC}"
    BASE_URL="$ANTHROPIC_BASE_URL"
fi

if [ -z "$ANTHROPIC_AUTH_TOKEN" ]; then
    echo -e "${RED}✗ ANTHROPIC_AUTH_TOKEN 未设置${NC}"
    echo "  无法继续测试"
    exit 1
else
    echo -e "${GREEN}✓ ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}...${NC}"
    API_KEY="$ANTHROPIC_AUTH_TOKEN"
fi

if [ -z "$ANTHROPIC_MODEL" ]; then
    echo -e "${YELLOW}⚠ ANTHROPIC_MODEL 未设置，使用默认${NC}"
    MODEL="mimo-v2.5-pro"
else
    echo -e "${GREEN}✓ ANTHROPIC_MODEL: $ANTHROPIC_MODEL${NC}"
    MODEL="$ANTHROPIC_MODEL"
fi

echo ""

# 测试1: 单次请求
echo "📋 步骤2: 测试单次请求"
echo "----------------------------------"

echo "发送测试请求..."
START_TIME=$(date +%s%N)

RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" \
  --max-time 30 \
  "$BASE_URL/v1/messages" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "'$MODEL'",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }' \
  2>/dev/null)

END_TIME=$(date +%s%N)

HTTP_CODE=$(echo "$RESPONSE" | tail -n2 | head -n1)
RESPONSE_TIME=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-2)

DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "HTTP状态码: $HTTP_CODE"
echo "响应时间: ${RESPONSE_TIME}s"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 单次请求成功${NC}"
    echo "响应: $(echo $BODY | head -c 100)..."
elif [ "$HTTP_CODE" = "429" ]; then
    echo -e "${RED}✗ 429错误: 请求过于频繁${NC}"
    echo "响应: $BODY"
    echo ""
    echo "🔍 分析429错误..."
    echo ""

    # 检查响应头中的rate limit信息
    echo "检查rate limit信息..."
    HEADERS=$(curl -s -I --max-time 10 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "'$MODEL'",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "test"}]
      }' \
      2>/dev/null)

    echo "$HEADERS" | grep -i "rate\|retry\|limit\|x-" || echo "未找到rate limit头信息"
else
    echo -e "${RED}✗ 请求失败: HTTP $HTTP_CODE${NC}"
    echo "响应: $BODY"
fi

echo ""

# 测试2: 连续请求测试
echo "📋 步骤3: 连续请求测试（模拟真实使用）"
echo "----------------------------------"

echo "发送5个连续请求，间隔1秒..."
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
RATE_LIMIT_COUNT=0

for i in {1..5}; do
    echo -n "请求 $i/5: "

    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --max-time 30 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "'$MODEL'",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Test '$i'"}]
      }' \
      2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ 成功${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$HTTP_CODE" = "429" ]; then
        echo -e "${RED}✗ 429频率限制${NC}"
        RATE_LIMIT_COUNT=$((RATE_LIMIT_COUNT + 1))
    else
        echo -e "${RED}✗ 失败: HTTP $HTTP_CODE${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # 等待1秒
    if [ $i -lt 5 ]; then
        sleep 1
    fi
done

echo ""
echo "测试结果:"
echo "  成功: $SUCCESS_COUNT"
echo "  429错误: $RATE_LIMIT_COUNT"
echo "  其他错误: $FAIL_COUNT"
echo ""

# 测试3: 快速连续请求
echo "📋 步骤4: 快速连续请求测试（无间隔）"
echo "----------------------------------"

echo "发送3个快速请求（无间隔）..."
echo ""

for i in {1..3}; do
    echo -n "快速请求 $i/3: "

    RESPONSE=$(curl -s -w "\n%{http_code}" \
      --max-time 10 \
      "$BASE_URL/v1/messages" \
      -H "x-api-key: $API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "'$MODEL'",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Quick test '$i'"}]
      }' \
      2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ 成功${NC}"
    elif [ "$HTTP_CODE" = "429" ]; then
        echo -e "${RED}✗ 429频率限制${NC}"
    else
        echo -e "${RED}✗ 失败: HTTP $HTTP_CODE${NC}"
    fi
done

echo ""

# 分析结果
echo "📋 步骤5: 分析结果"
echo "----------------------------------"

echo "429错误可能原因:"
echo ""
echo "1. 🔴 API Key额度用尽"
echo "   - 检查MIMO控制台的额度使用情况"
echo "   - 联系MIMO团队增加额度"
echo ""
echo "2. 🔴 共享Key的RPM限制"
echo "   - 所有用户共用同一个API Key"
echo "   - 总RPM是固定的，用户越多，每用户可用RPM越少"
echo "   - 建议: 申请专属API Key"
echo ""
echo "3. 🔴 请求过于频繁"
echo "   - 当前设置: 最小1秒间隔"
echo "   - 建议: 增加到2-3秒间隔"
echo ""
echo "4. 🔴 代理服务限流"
echo "   - 代理服务可能有自己的限制"
echo "   - 建议: 使用官方API端点"
echo ""
echo "5. 🔴 并发请求过多"
echo "   - 多个MIMO实例同时运行"
echo "   - 建议: 减少并发实例"
echo ""

# 提供解决方案
echo "📋 步骤6: 解决方案"
echo "----------------------------------"

echo "立即解决方案:"
echo ""
echo "1. 增加请求间隔"
echo "   export MIMO_REQUEST_INTERVAL=3000  # 3秒间隔"
echo ""
echo "2. 使用专属API Key"
echo "   - 联系MIMO团队申请"
echo "   - 获得独立的RPM配额"
echo ""
echo "3. 减少并发使用"
echo "   - 只运行一个MIMO实例"
echo "   - 避免同时多个终端"
echo ""
echo "4. 使用缓存"
echo "   - 启用prompt caching"
echo "   - 减少重复请求"
echo ""
echo "5. 错峰使用"
echo "   - 避开高峰时段"
echo "   - 选择低峰期使用"
echo ""

# 生成报告
REPORT_FILE="mimo-429-diagnosis-$(date +%Y%m%d_%H%M%S).txt"
cat > "$REPORT_FILE" << EOF
MIMO API 429错误诊断报告
生成时间: $(date)

环境配置:
- ANTHROPIC_BASE_URL: $BASE_URL
- ANTHROPIC_AUTH_TOKEN: ${API_KEY:0:20}...
- ANTHROPIC_MODEL: $MODEL

测试结果:
- 单次请求: HTTP $HTTP_CODE
- 连续请求: 成功=$SUCCESS_COUNT, 429=$RATE_LIMIT_COUNT, 失败=$FAIL_COUNT

可能原因:
1. API Key额度用尽
2. 共享Key的RPM限制
3. 请求过于频繁
4. 代理服务限流
5. 并发请求过多

建议:
1. 增加请求间隔到3秒
2. 申请专属API Key
3. 减少并发使用
4. 启用缓存
5. 错峰使用
EOF

echo "📄 诊断报告已保存到: $REPORT_FILE"
echo ""
echo "=================================="
echo "  诊断完成"
echo "=================================="
