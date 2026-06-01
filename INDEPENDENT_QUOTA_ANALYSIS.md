# 独立配额429错误深度分析

## 问题现象

```
✖ 429 频率超限 / Rate limit exceeded.
  代理地址 / Proxy: https://token-plan-sgp.xiaomimimo.com/anthropic
  已重试 3 次(5s/10s/20s)均失败 / All 3 retries failed.
```

**配置**：
- Token额度: 400亿
- 配额类型: 独立配额（非共享）

**问题**：为什么独立配额还会429？

---

## 🔍 核心结论

### ❌ 不是Token额度问题
- 400亿token足够用很久
- Token额度充足

### ❌ 不是共享Key问题
- 已确认是独立配额
- 不受其他用户影响

### ✅ 是RPM（每分钟请求数）限制
- **即使独立配额也有RPM限制**
- Token额度 ≠ RPM额度
- 这是两个完全独立的限制

---

## 📊 详细解释

### Token额度 vs RPM额度

```
Token额度（你的）: 400,000,000,000 tokens
  ↓
这是你"可以使用"的总量
  ↓
但使用时需要通过"请求"来消耗
  ↓
每个请求消耗一定的token
  ↓
但请求本身有频率限制（RPM）
  ↓
即使独立配额，RPM也有限制
```

**类比**：
- Token额度 = 你有400亿的钱
- RPM额度 = 你每分钟只能花X次钱
- 即使你有很多钱，花钱次数也有限制
- 即使是独立账户，花钱次数也有限制

### 独立配额的RPM限制

```
独立配额:
- Token额度: 400亿 ✅
- RPM额度: 可能是60、100、200等 ❌
- 并发限制: 可能是5、10等 ❌

问题:
- Token额度充足
- 但RPM额度可能不足
- 连续对话需要多个请求
- 超过RPM限制 → 429错误
```

### 代理服务的额外限制

```
当前使用代理: https://token-plan-sgp.xiaomimimo.com/anthropic

代理服务可能有:
1. 自己的RPM限制（独立于你的配额）
2. IP限制（基于IP的限流）
3. 并发限制（同时进行的请求数）
4. 用户/Key限制（基于用户的限流）
```

---

## 🎯 429错误的真正原因

### 原因1: RPM限制（最可能）

**问题**：
- 即使是独立配额，也有RPM限制
- Token额度 ≠ RPM额度
- RPM限制是独立的

**示例**：
```
独立配额:
- Token额度: 400亿 ✅
- RPM限制: 100 RPM ❌

问题:
- 你有400亿token可以用
- 但你每分钟只能用100次
- 连续对话需要多个请求
- 超过100个请求/分钟 → 429错误
```

### 原因2: 代理服务限流

**问题**：
- 使用的是代理：`https://token-plan-sgp.xiaomimimo.com/anthropic`
- 代理服务可能有自己的RPM限制
- 代理服务可能对独立配额也有额外限制

**代理服务可能的限制**：
```
1. 总RPM限制 - 代理服务的总请求限制
2. 用户RPM限制 - 每用户的请求限制
3. IP限制 - 基于IP的限流
4. 并发限制 - 同时进行的请求数
```

### 原因3: 请求模式触发限流

**MIMO的请求模式**：
```
用户输入: "帮我写一个React组件"

MIMO内部请求:
1. 发送消息 → 1个请求
2. AI响应（流式） → 1个请求
3. 工具调用（file_write） → 1个请求
4. 工具结果 → 1个请求
5. AI继续响应 → 1个请求

总计: 5个请求/轮对话
```

**问题**：
- 每轮对话需要多个请求
- 即使RPM=100，也只能进行20轮对话/分钟
- 连续对话时很快触发429

### 原因4: 并发限制

**问题**：
- 多个终端同时运行MIMO
- 多个会话同时活跃
- 累积请求超过并发限制

---

## 📈 验证方法

### 运行诊断脚本

```bash
./diagnose-independent-quota.sh
```

**诊断内容**：
1. 获取详细的响应头信息
2. 测试快速连续请求
3. 测试不同间隔
4. 测试代理服务限制
5. 测试并发限制

### 手动验证

#### 1. 检查响应头
```bash
curl -I -X POST $ANTHROPIC_BASE_URL/v1/messages \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'

# 查看:
# - x-ratelimit-limit: RPM限制
# - x-ratelimit-remaining: 剩余RPM
# - x-ratelimit-reset: 重置时间
# - retry-after: 建议等待时间
```

#### 2. 测试RPM限制
```bash
# 发送10个快速请求
for i in {1..10}; do
    echo "请求 $i:"
    curl -s -w "HTTP %{http_code}\n" \
      --max-time 10 \
      "$ANTHROPIC_BASE_URL/v1/messages" \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test '$i'"}]}' \
      2>/dev/null | tail -1
done

# 观察429出现在第几个请求
# 这就是你的RPM限制
```

#### 3. 测试不同间隔
```bash
# 测试1秒间隔
for i in {1..5}; do
    curl -s -X POST $ANTHROPIC_BASE_URL/v1/messages \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      | jq -r '.content[0].text' 2>/dev/null || echo "失败"
    sleep 1
done

# 测试2秒间隔
for i in {1..5}; do
    curl -s -X POST $ANTHROPIC_BASE_URL/v1/messages \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Test"}]}' \
      | jq -r '.content[0].text' 2>/dev/null || echo "失败"
    sleep 2
done
```

---

## 🛠️ 解决方案

### 方案1: 增加请求间隔（立即生效）

**当前设置**：
```typescript
minIntervalMs: 1000  // 1秒
```

**优化设置**：
```typescript
minIntervalMs: 3000  // 3秒
```

**效果**：
```
1秒间隔: 60 RPM → 可能触发429
3秒间隔: 20 RPM → 大幅降低429概率
```

**实现**：
```bash
export MIMO_REQUEST_INTERVAL=3000
npm run dev
```

### 方案2: 联系MIMO团队

**询问内容**：
1. 独立配额的RPM限制是多少？
2. 代理服务有哪些额外限制？
3. 如何增加RPM配额？
4. 并发限制是多少？

**预期**：
- 获得明确的RPM限制信息
- 可能申请增加RPM配额
- 了解代理服务的限制

### 方案3: 使用本地模型（完全无限制）

**为什么有效**：
- ✅ 完全无RPM限制
- ✅ 无需API Key
- ✅ 离线可用
- ✅ 无429错误

**实现**：
```bash
# 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 下载模型
ollama pull llama3.1

# 启动Ollama
ollama serve

# 配置MIMO
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_MODEL=llama3.1

# 启动MIMO
npm run dev
```

### 方案4: 优化请求模式

**问题**：
- MIMO每轮对话需要多个请求
- 流式响应消耗更多RPM
- 工具调用需要额外请求

**优化**：
```bash
# 禁用流式响应
export MIMO_STREAM=false

# 减少工具调用
# 合并多个操作
# 使用缓存减少请求
```

---

## 📊 方案对比

| 方案 | 效果 | 实施难度 | 推荐度 |
|------|------|----------|--------|
| 当前（1秒间隔） | 429频繁 | - | ❌ |
| 增加间隔（3秒） | 降低429 | 低 | ⭐⭐⭐ |
| 联系MIMO团队 | 获得信息 | 中 | ⭐⭐⭐⭐ |
| 本地模型 | 无限制 | 中 | ⭐⭐⭐⭐⭐ |
| 优化请求模式 | 减少请求 | 高 | ⭐⭐⭐ |

---

## 🎯 立即行动

### 步骤1: 运行诊断
```bash
./diagnose-independent-quota.sh
```

### 步骤2: 增加请求间隔（立即生效）
```bash
export MIMO_REQUEST_INTERVAL=3000
npm run dev
```

### 步骤3: 联系MIMO团队
- 确认RPM限制
- 申请增加配额
- 了解代理限制

### 步骤4: 使用本地模型（备用）
```bash
# 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1
ollama serve

# 配置MIMO
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_MODEL=llama3.1
```

---

## 📝 总结

### 独立配额429错误真正原因

**❌ 不是Token额度问题**：
- 400亿token足够用很久

**❌ 不是共享Key问题**：
- 已确认是独立配额

**✅ 是RPM（每分钟请求数）限制**：
- 即使独立配额也有RPM限制
- Token额度 ≠ RPM额度
- 代理服务可能有自己的RPM限制
- 请求模式可能触发限流

### 最佳解决方案

1. **增加请求间隔**（立即）
   - 降低RPM消耗
   - 减少429概率

2. **联系MIMO团队**（了解）
   - 确认RPM限制
   - 申请增加配额

3. **使用本地模型**（备用）
   - 完全无限制
   - 无需API Key

### 立即行动

```bash
# 1. 运行诊断
./diagnose-independent-quota.sh

# 2. 增加间隔
export MIMO_REQUEST_INTERVAL=3000

# 3. 重启MIMO
npm run dev
```

---

**版本**: v2.0.0
**更新时间**: 2026-06-01
**Token额度**: 400亿
**配额类型**: 独立配额
**问题**: RPM限制（非Token额度）
**状态**: 已深度分析，提供多种解决方案
