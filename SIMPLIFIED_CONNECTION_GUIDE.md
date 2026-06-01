# MIMO CLI - 简化连接方式

## ✅ 已完成

已移除所有其他连接方式，只保留官方MIMO连接方式。

---

## 🔧 配置方式

### 使用环境变量（推荐）

```bash
# 设置环境变量
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
```

### 使用配置脚本

```bash
./setup-env-vars.sh
```

### 手动配置

```bash
# 创建环境变量文件
cat > ~/.mimo/.env << 'EOF'
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
ANTHROPIC_AUTH_TOKEN=你的API Key
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
EOF

# 添加到shell配置
echo 'source ~/.mimo/.env' >> ~/.bashrc
source ~/.bashrc
```

---

## 📊 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_BASE_URL` | API端点 | `https://token-plan-sgp.xiaomimimo.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | API Key | 必须设置 |
| `ANTHROPIC_MODEL` | 模型名称 | `mimo-v2.5-pro` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet模型 | `mimo-v2.5-pro` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus模型 | `mimo-v2.5-pro` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku模型 | `mimo-v2.5-pro` |

### 配置文件

配置文件位置: `~/.mimo/config.toml`

```toml
[api]
mode = "token-plan"
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "你的API Key"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "你的API Key"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
maxTokensPerTurn = 32768
```

---

## 🚀 立即使用

### 步骤1: 设置环境变量

```bash
# 方法1: 直接设置
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro

# 方法2: 使用脚本
./setup-env-vars.sh

# 方法3: 添加到配置文件
echo 'export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic' >> ~/.bashrc
echo 'export ANTHROPIC_AUTH_TOKEN=你的API Key' >> ~/.bashrc
source ~/.bashrc
```

### 步骤2: 测试连接

```bash
# 测试API连接
curl -X POST https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages \
  -H "x-api-key: 你的API Key" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 步骤3: 启动MIMO

```bash
npm run dev
```

---

## 📝 代码实现

### auth.ts 核心实现

```typescript
/**
 * 创建MIMO API客户端
 * 使用官方连接方式：ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
 */
export function createApiClient(config: MimoConfig): ApiAdapter {
  // 从环境变量或配置中获取
  const baseURL = process.env.ANTHROPIC_BASE_URL
    || config.api.tokenPlan.baseUrl
    || 'https://token-plan-sgp.xiaomimimo.com/anthropic';

  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN
    || config.api.tokenPlan.apiKey;

  return new MimoAdapter({
    baseURL,
    apiKey,
    model: process.env.ANTHROPIC_MODEL || config.api.model || 'mimo-v2.5-pro',
  });
}
```

### Anthropic SDK 配置

```typescript
// 使用Anthropic SDK，指向MIMO API端点
this.client = new Anthropic({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  maxRetries: 3,
  timeout: 600_000,  // 10分钟
});
```

---

## 🔒 安全建议

### 1. 不要提交API Key到Git

```bash
# .gitignore
.env
*.toml
```

### 2. 使用环境变量

```bash
# 在shell配置中设置
export ANTHROPIC_AUTH_TOKEN=你的API Key
```

### 3. 定期轮换Key

- 定期更换API Key
- 监控使用情况
- 不要分享Key

---

## 🧪 测试连接

### 测试脚本

```bash
./test-mimo-api.sh
```

### 手动测试

```bash
# 测试连接
curl -X POST https://token-plan-sgp.xiaomimimo.com/anthropic/v1/messages \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 预期响应
# {"id":"...","type":"message","role":"assistant","model":"mimo-v2.5-pro",...}
```

---

## 📊 编译测试结果

```
✅ 编译状态: 通过
✅ 测试结果: 221个测试全部通过
✅ 连接方式: 简化完成
✅ 只保留官方MIMO连接方式
```

---

## 🎯 核心改动

### 移除的内容

- ❌ Provider选择（ollama, openai-compatible）
- ❌ 复杂的适配器系统
- ❌ 多种连接方式
- ❌ 不必要的配置选项

### 保留的内容

- ✅ 官方MIMO连接方式
- ✅ Anthropic SDK
- ✅ 环境变量配置
- ✅ 简化的配置结构

---

## 💡 使用建议

### 1. 使用环境变量（推荐）

```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
```

### 2. 或使用配置文件

```bash
# 编辑配置文件
nano ~/.mimo/config.toml

# 填入API Key和Base URL
```

### 3. 测试连接

```bash
./test-mimo-api.sh
```

### 4. 启动MIMO

```bash
npm run dev
```

---

## 🎉 总结

**已完成简化**：
- ✅ 移除所有其他连接方式
- ✅ 只保留官方MIMO连接方式
- ✅ 使用环境变量配置
- ✅ 简化代码结构
- ✅ 编译测试通过

**配置方式**：
```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
```

**立即使用**：
```bash
npm run dev
```

---

**版本**: v2.0.0
**更新时间**: 2026-06-01
**连接方式**: 官方MIMO连接（简化版）
**编译状态**: ✅ 通过
**测试状态**: ✅ 221个测试全部通过
