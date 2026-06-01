# MIMO API 环境变量配置指南

## 问题

错误信息：
```
✖ ANTHROPIC_BASE_URL environment variable is required.
Please set it to your MIMO API endpoint.
```

这是因为没有设置必需的环境变量。

---

## 解决方案

### 方案1: 使用配置脚本（推荐）

```bash
./setup-env.sh
```

然后编辑 `.env` 文件填入你的API Key。

### 方案2: 手动设置环境变量

```bash
# 设置环境变量
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro

# 启动MIMO
npm run dev
```

### 方案3: 添加到shell配置（永久生效）

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
echo 'export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic' >> ~/.bashrc
echo 'export ANTHROPIC_AUTH_TOKEN=你的API Key' >> ~/.bashrc
echo 'export ANTHROPIC_MODEL=mimo-v2.5-pro' >> ~/.bashrc
echo 'export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro' >> ~/.bashrc
echo 'export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro' >> ~/.bashrc
echo 'export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro' >> ~/.bashrc

# 重新加载配置
source ~/.bashrc

# 启动MIMO
npm run dev
```

### 方案4: 创建 .env 文件

```bash
# 创建 .env 文件
cat > .env << 'EOF'
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
ANTHROPIC_AUTH_TOKEN=你的API Key
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
EOF

# 启动MIMO（需要安装dotenv）
npm run dev
```

---

## 环境变量说明

| 环境变量 | 说明 | 是否必须 | 默认值 |
|---------|------|----------|--------|
| `ANTHROPIC_BASE_URL` | API端点 | **必须** | 无 |
| `ANTHROPIC_AUTH_TOKEN` | API Key | **必须** | 无 |
| `ANTHROPIC_MODEL` | 模型名称 | 可选 | `mimo-v2.5-pro` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet模型 | 可选 | `mimo-v2.5-pro` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus模型 | 可选 | `mimo-v2.5-pro` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku模型 | 可选 | `mimo-v2.5-pro` |

---

## 快速配置

### 步骤1: 获取API Key

从MIMO控制台获取你的API Key。

### 步骤2: 设置环境变量

```bash
# 替换 "你的API Key" 为实际的API Key
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
```

### 步骤3: 验证配置

```bash
# 检查环境变量
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_AUTH_TOKEN
echo $ANTHROPIC_MODEL

# 测试API连接
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

### 步骤4: 启动MIMO

```bash
npm run dev
```

---

## 常见问题

### 问题1: 环境变量未生效

**原因**: 环境变量只在当前shell会话中有效。

**解决**:
```bash
# 重新设置环境变量
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key

# 或添加到shell配置（永久生效）
echo 'export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic' >> ~/.bashrc
source ~/.bashrc
```

### 问题2: API Key无效

**原因**: API Key不正确或已过期。

**解决**:
1. 检查API Key是否正确
2. 从MIMO控制台获取新的API Key
3. 重新设置环境变量

### 问题3: 连接超时

**原因**: 网络问题或API端点不可达。

**解决**:
1. 检查网络连接
2. 验证API端点是否正确
3. 尝试使用其他网络

---

## 完整配置示例

### .env 文件

```bash
# MIMO API 环境变量配置
# 使用官方Anthropic SDK连接方式

# API端点（必须）
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic

# API Key（必须）
ANTHROPIC_AUTH_TOKEN=tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5

# 模型名称
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
```

### shell配置

```bash
# ~/.bashrc 或 ~/.zshrc
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
```

---

## 验证配置

### 检查环境变量

```bash
echo "ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
echo "ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:20}..."
echo "ANTHROPIC_MODEL: $ANTHROPIC_MODEL"
```

### 测试API连接

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

### 启动MIMO

```bash
npm run dev
```

---

## 技术细节

### 为什么使用环境变量？

1. **安全性** — API Key不存储在代码中
2. **灵活性** — 不同环境可以使用不同配置
3. **标准化** — 符合12-Factor App原则
4. **兼容性** — 与Anthropic SDK完全兼容

### Anthropic SDK 配置

```typescript
// auth.ts 中的实现
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
  maxRetries: 3,
  timeout: 600_000,
});
```

---

## 总结

**必须设置的环境变量**:
- `ANTHROPIC_BASE_URL` — API端点
- `ANTHROPIC_AUTH_TOKEN` — API Key

**快速配置**:
```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
npm run dev
```

**永久配置**:
```bash
echo 'export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic' >> ~/.bashrc
echo 'export ANTHROPIC_AUTH_TOKEN=你的API Key' >> ~/.bashrc
source ~/.bashrc
npm run dev
```

---

**版本**: v2.0.0
**更新时间**: 2026-06-01
**配置方式**: 环境变量
