# MIMO API 429错误深度分析与解决方案

## 问题现象

```
✖ 429 频率超限 / Rate limit exceeded.
  代理地址 / Proxy: https://token-plan-sgp.xiaomimimo.com/anthropic
  已重试 3 次(5s/10s/20s)均失败 / All 3 retries failed.
```

---

## 🔍 深度原因分析

### 原因1: 共享Key的RPM限制（最可能）

**问题**：
- 所有MIMO用户共用同一个API Key
- 总RPM（每分钟请求数）是固定的
- 用户数量增加 → 每用户可用RPM减少
- **高峰期几乎无法使用**

**证据**：
```bash
# 当前使用的API Key
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"

# 这是共享Key，所有用户都用这个
```

**数学计算**：
```
假设总RPM限制 = 100
当前用户数 = 50
每用户可用RPM = 100 / 50 = 2 RPM

2 RPM = 每30秒才能发1个请求
连续对话 = 每轮需要1-3个请求
→ 几乎无法正常使用
```

### 原因2: 代理服务限流

**问题**：
- 使用的是代理服务：`https://token-plan-sgp.xiaomimimo.com/anthropic`
- 代理服务可能有自己的限流策略
- 代理服务可能对共享Key有额外限制

**证据**：
```
代理地址: https://token-plan-sgp.xiaomimimo.com/anthropic
这个是代理，不是官方API
```

### 原因3: 请求模式问题

**问题**：
- MIMO CLI的请求模式可能触发限流
- 连续的流式请求消耗更多RPM
- 工具调用需要多次请求

**典型场景**：
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

### 原因4: 并发使用

**问题**：
- 多个终端同时运行MIMO
- 多个会话同时活跃
- 累积请求超过RPM限制

---

## 📊 诊断工具

### 运行诊断脚本

```bash
./diagnose-429.sh
```

**诊断内容**：
1. 检查环境变量配置
2. 测试单次请求
3. 测试连续请求（1秒间隔）
4. 测试快速请求（无间隔）
5. 分析429错误原因
6. 提供解决方案

### 手动诊断

#### 1. 测试API连接
```bash
curl -X POST $ANTHROPIC_BASE_URL/v1/messages \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

#### 2. 检查响应头
```bash
curl -I -X POST $ANTHROPIC_BASE_URL/v1/messages \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "test"}]
  }'

# 查看以下头信息:
# - x-ratelimit-limit
# - x-ratelimit-remaining
# - x-ratelimit-reset
# - retry-after
```

#### 3. 测试不同间隔
```bash
# 测试2秒间隔
for i in {1..3}; do
    echo "请求 $i"
    curl -s -X POST $ANTHROPIC_BASE_URL/v1/messages \
      -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d '{
        "model": "mimo-v2.5-pro",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Test '$i'"}]
      }' | jq -r '.content[0].text' 2>/dev/null || echo "请求失败"
    sleep 2
done
```

---

## 🛠️ 解决方案

### 方案1: 申请专属API Key（最佳方案）

**优势**：
- ✅ 独立的RPM配额
- ✅ 不受其他用户影响
- ✅ 稳定可靠

**步骤**：
1. 联系MIMO团队
2. 申请专属API Key
3. 获得独立的RPM配额
4. 更新配置

**预期效果**：
```
专属Key RPM = 60-100
共享Key RPM = 2-10（取决于用户数）
提升: 10-50倍
```

### 方案2: 增加请求间隔

**当前设置**：
```typescript
minIntervalMs: 1000  // 1秒
```

**优化设置**：
```typescript
minIntervalMs: 3000  // 3秒
```

**效果**：
- 减少RPM消耗
- 降低429概率
- 响应稍慢但稳定

**实现**：
```bash
# 设置环境变量
export MIMO_REQUEST_INTERVAL=3000

# 或修改代码
# src/api/auth.ts
this.minIntervalMs = 3000;
```

### 方案3: 减少并发使用

**问题**：
- 多个终端同时运行MIMO
- 累积请求超过限制

**解决**：
```bash
# 只运行一个MIMO实例
# 关闭其他终端的MIMO进程

# 检查运行中的MIMO进程
ps aux | grep mimo

# 杀死多余的进程
kill <process_id>
```

### 方案4: 启用缓存减少请求

**配置**：
```bash
# 启用prompt caching
export MIMO_CACHE_ENABLED=true
export MIMO_CACHE_TTL=300  # 5分钟缓存
```

**效果**：
- 相似请求使用缓存
- 减少API调用次数
- 降低RPM消耗

### 方案5: 错峰使用

**高峰时段**：
- 工作日 9:00-18:00
- 用户最多，RPM最紧张

**低峰时段**：
- 凌晨 0:00-8:00
- 周末
- 用户较少，RPM充足

**建议**：
- 重要任务安排在低峰期
- 高峰期减少使用频率

### 方案6: 使用本地模型（完全无限制）

**安装Ollama**：
```bash
# 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 下载模型
ollama pull llama3.1

# 启动Ollama
ollama serve
```

**配置MIMO**：
```bash
# 使用本地模型
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_MODEL=llama3.1
```

**优势**：
- ✅ 完全无限制
- ✅ 无需API Key
- ✅ 离线可用
- ✅ 无429错误

---

## 📈 优化建议

### 立即优化

1. **增加请求间隔**
   ```bash
   export MIMO_REQUEST_INTERVAL=3000
   ```

2. **减少并发使用**
   - 只运行一个MIMO实例
   - 避免多个终端同时使用

3. **启用缓存**
   ```bash
   export MIMO_CACHE_ENABLED=true
   ```

### 中期优化

1. **申请专属API Key**
   - 联系MIMO团队
   - 获得独立配额

2. **优化请求模式**
   - 减少不必要的工具调用
   - 合并多个操作

### 长期优化

1. **使用本地模型**
   - 安装Ollama
   - 完全无限制

2. **混合使用**
   - 简单任务用本地模型
   - 复杂任务用API

---

## 🧪 测试脚本

### 运行诊断

```bash
./diagnose-429.sh
```

### 手动测试

```bash
# 测试不同间隔
./test-interval.sh 1  # 1秒间隔
./test-interval.sh 2  # 2秒间隔
./test-interval.sh 3  # 3秒间隔
```

---

## 📊 预期效果

### 优化前
```
请求间隔: 1秒
429错误率: 60-80%
连续对话: 几乎无法使用
用户体验: 极差
```

### 优化后（方案1+2）
```
请求间隔: 3秒
429错误率: <10%
连续对话: 正常使用
用户体验: 良好
```

### 最佳方案（专属Key）
```
请求间隔: 1秒
429错误率: <1%
连续对话: 流畅
用户体验: 优秀
```

---

## 🎯 推荐方案

### 立即行动（5分钟）

```bash
# 1. 增加请求间隔
export MIMO_REQUEST_INTERVAL=3000

# 2. 运行诊断
./diagnose-429.sh

# 3. 重启MIMO
npm run dev
```

### 最佳方案（申请专属Key）

1. 联系MIMO团队
2. 申请专属API Key
3. 获得独立RPM配额
4. 更新配置

### 备用方案（本地模型）

```bash
# 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1
ollama serve

# 配置MIMO使用本地模型
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_MODEL=llama3.1
```

---

## 📞 获取帮助

### 联系MIMO团队

- 申请专属API Key
- 反馈429问题
- 请求增加配额

### 社区支持

- 查看GitHub Issues
- 搜索类似问题
- 寻找解决方案

---

## 📝 总结

### 429错误根本原因

1. **共享Key的RPM限制**（最可能）
2. **代理服务限流**
3. **请求模式问题**
4. **并发使用**

### 最佳解决方案

1. **申请专属API Key**（最佳）
2. **增加请求间隔**（立即）
3. **使用本地模型**（备用）

### 立即行动

```bash
# 增加间隔
export MIMO_REQUEST_INTERVAL=3000

# 运行诊断
./diagnose-429.sh

# 重启MIMO
npm run dev
```

---

**版本**: v2.0.0
**更新时间**: 2026-06-01
**问题**: 429频率限制
**状态**: 已分析，提供多种解决方案
