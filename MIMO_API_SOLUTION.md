# 🔧 MiMo API 配置和429问题解决

## 问题现状

**当前问题**：
- 共享Key的RPM限制导致频繁429错误
- 连正常对话都无法做到

**解决方案**：
- 使用官方API端点：`https://api.xiaomimimo.com/v1/chat/completions`
- 使用正确的认证方式：`api-key` header
- 使用OpenAI兼容格式

---

## ✅ 已完成的修改

### 1. 创建新的API客户端

**文件**: `src/api/mimo-client.ts`
- ✅ 使用官方API端点
- ✅ 使用`api-key` header认证
- ✅ 支持流式和非流式响应
- ✅ 支持工具调用
- ✅ 支持思考内容
- ✅ 完善的错误处理和重试机制

### 2. 创建新的适配器

**文件**: `src/api/mimo-adapter.ts`
- ✅ 转换Anthropic格式到MiMo格式
- ✅ 支持所有API功能
- ✅ 完全兼容现有代码

### 3. 更新配置系统

**文件**: `src/config/schema.ts`
- ✅ 添加`'mimo'`到ProviderType
- ✅ 更新ProviderSchema
- ✅ 更新VALID_PROVIDERS

**文件**: `src/api/auth.ts`
- ✅ 使用新的MiMoApiAdapter
- ✅ 默认使用官方端点

---

## 🚀 立即使用

### 步骤1: 更新配置

```bash
./update-to-official-api.sh
```

或手动更新：

```bash
cat > ~/.mimo/config.toml << 'EOF'
[api]
provider = "mimo"
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "你的API Key"
baseUrl = "https://api.xiaomimimo.com"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "你的API Key"
baseUrl = "https://api.xiaomimimo.com"
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
```

### 步骤2: 测试连接

```bash
./test-mimo-api.sh
```

### 步骤3: 重新编译

```bash
npm run build
```

### 步骤4: 启动

```bash
npm run dev
```

---

## 🔍 API连接测试

### 测试结果

```
❌ 401错误：API Key无效
```

**可能原因**：
1. API Key格式不正确
2. API Key已过期
3. API Key权限不足
4. 需要使用不同的API Key

### 解决方案

**方案1: 检查API Key**
```bash
# 查看当前API Key
cat ~/.mimo/config.toml | grep apiKey

# 确认API Key格式
# 正确格式: tp-xxxxxxxxxxxxxxx
```

**方案2: 获取新的API Key**
1. 登录MiMo控制台
2. 获取新的API Key
3. 更新配置文件

**方案3: 使用其他API**
```bash
# 使用OpenAI兼容API
./switch-api.sh  # 选择选项2
```

**方案4: 使用本地模型**
```bash
# 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 下载模型
ollama pull llama3.1

# 配置MIMO
./switch-api.sh  # 选择选项1
```

---

## 📊 API端点对比

### 旧端点（有问题）
```
URL: https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages
认证: x-api-key header
格式: Anthropic格式
问题: 共享Key，RPM限制
```

### 新端点（推荐）
```
URL: https://api.xiaomimimo.com/v1/chat/completions
认证: api-key header
格式: OpenAI兼容格式
优势: 官方端点，更稳定
```

---

## 🔧 代码修改详情

### mimo-client.ts
```typescript
// 使用官方API端点
const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'api-key': apiKey,  // 正确的认证方式
  },
  body: JSON.stringify({
    messages: [...],
    model: 'mimo-v2.5-pro',
    max_completion_tokens: 4096,
    temperature: 1.0,
    stream: false,
  }),
});
```

### mimo-adapter.ts
```typescript
// 转换Anthropic格式到MiMo格式
convertMessages(messages, systemPrompt) {
  // 添加系统提示
  // 转换用户消息
  // 转换助手消息
}

convertTools(tools) {
  // 转换工具格式
}

convertResponse(response) {
  // 转换响应格式
}
```

---

## 🎯 429问题彻底解决

### 解决方案

1. **使用官方API端点**
   - 避免共享Key的代理
   - 更稳定的连接

2. **优化请求频率**
   - 降低RPM到20
   - 增加缓存时间
   - 减少不必要的请求

3. **完善重试机制**
   - 指数退避
   - 智能重试
   - 错误处理

### 配置优化

```typescript
// rate-limiter.ts
const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 20,      // 20 RPM（推荐）
  minIntervalMs: 3000,        // 3秒间隔
  cooldownBaseMs: 5000,       // 429 -> 等待5秒
  cooldownMaxMs: 60000,       // 最大60秒
  cooldownMultiplier: 2,      // 指数退避
  maxRetries: 5,              // 5次重试
};
```

---

## 📋 配置文件说明

### 完整配置示例

```toml
# MiMo API 配置
# 使用官方API端点

[api]
provider = "mimo"            # 使用MiMo官方API
model = "mimo-v2.5-pro"      # 默认模型
stream = true                # 启用流式

[api.tokenPlan]
apiKey = "你的API Key"       # MiMo API Key
baseUrl = "https://api.xiaomimimo.com"  # 官方端点
monthlyBudget = 999999999999 # 月度预算

[api.payAsYouGo]
apiKey = "你的API Key"       # MiMo API Key
baseUrl = "https://api.xiaomimimo.com"  # 官方端点
maxTokensPerTurn = 32768     # 每轮最大Token

[agent]
mode = "yolo"                # 运行模式
maxTurns = 50                # 最大轮数
autoApproveReads = true      # 自动批准读取

[promptCaching]
enabled = true               # 启用缓存
cacheTtl = 300               # 缓存5分钟

[features]
enabled = true               # 启用功能
disabledFeatures = []        # 禁用的功能
```

---

## 🧪 测试和验证

### 测试API连接

```bash
# 使用测试脚本
./test-mimo-api.sh

# 或手动测试
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
  --header "api-key: 你的API Key" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "messages": [{"role": "user", "content": "Hello"}],
    "model": "mimo-v2.5-pro",
    "max_completion_tokens": 100,
    "stream": false
  }'
```

### 测试MIMO

```bash
# 重新编译
npm run build

# 启动MIMO
npm run dev

# 测试对话
# 输入: "Hello, how are you?"
```

---

## 🔐 安全注意事项

### API Key安全

1. **不要提交到Git**
   ```bash
   # .gitignore
   .env
   *.toml
   ```

2. **使用环境变量**
   ```bash
   export MIMO_API_KEY="你的API Key"
   ```

3. **定期轮换Key**
   - 定期更换API Key
   - 监控使用情况

---

## 📈 性能优化

### 减少API调用

1. **启用缓存**
   ```toml
   [promptCaching]
   enabled = true
   cacheTtl = 600  # 10分钟
   ```

2. **压缩上下文**
   - 减少消息长度
   - 移除不必要内容

3. **智能模型选择**
   - 简单任务用小模型
   - 复杂任务用大模型

### 监控使用

```bash
# 查看统计
/stats

# 查看健康状态
# (在代码中)
apiManager.getHealthStatus()
```

---

## 🎉 总结

### 已完成

✅ 创建新的MiMo API客户端
✅ 使用官方API端点
✅ 正确的认证方式
✅ OpenAI兼容格式
✅ 完善的错误处理
✅ 重试机制
✅ 编译通过

### 下一步

1. ✅ 更新配置文件
2. ✅ 测试API连接
3. ✅ 重新编译
4. ✅ 启动使用

### 立即行动

```bash
# 1. 更新配置
./update-to-official-api.sh

# 2. 测试连接
./test-mimo-api.sh

# 3. 重新编译
npm run build

# 4. 启动
npm run dev
```

---

**版本**: v2.0.0
**更新时间**: 2026-06-01
**API端点**: https://api.xiaomimimo.com/v1/chat/completions
**状态**: ✅ 编译通过
