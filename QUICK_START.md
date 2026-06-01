# 🚀 MIMO 快速配置参考

## ⚠️ 错误信息

```
✖ ANTHROPIC_BASE_URL environment variable is required.
Please set it to your MIMO API endpoint.
```

---

## ✅ 快速解决（3步）

### 步骤1: 设置环境变量

```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
```

### 步骤2: 启动MIMO

```bash
npm run dev
```

### 步骤3: 开始使用

输入你的问题即可！

---

## 🔧 配置方式

### 方式1: 临时设置（当前会话）

```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
npm run dev
```

### 方式2: 永久设置（推荐）

```bash
# 添加到 ~/.bashrc
echo 'export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic' >> ~/.bashrc
echo 'export ANTHROPIC_AUTH_TOKEN=你的API Key' >> ~/.bashrc
echo 'export ANTHROPIC_MODEL=mimo-v2.5-pro' >> ~/.bashrc
echo 'export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro' >> ~/.bashrc
echo 'export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro' >> ~/.bashrc
echo 'export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro' >> ~/.bashrc

# 重新加载
source ~/.bashrc

# 启动
npm run dev
```

### 方式3: 使用脚本

```bash
# 一键配置
./setup-env.sh

# 编辑 .env 文件
nano .env

# 启动
./start.sh
```

---

## 📋 环境变量清单

| 变量 | 必须 | 说明 |
|------|------|------|
| `ANTHROPIC_BASE_URL` | ✅ | API端点 |
| `ANTHROPIC_AUTH_TOKEN` | ✅ | API Key |
| `ANTHROPIC_MODEL` | 可选 | 模型名称 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 可选 | Sonnet模型 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 可选 | Opus模型 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 可选 | Haiku模型 |

---

## 🧪 验证配置

```bash
# 检查环境变量
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_AUTH_TOKEN

# 测试连接
curl -X POST $ANTHROPIC_BASE_URL/v1/messages \
  -H "x-api-key: $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"mimo-v2.5-pro","max_tokens":10,"messages":[{"role":"user","content":"Hello"}]}'
```

---

## 💡 示例

### 完整配置示例

```bash
# 设置环境变量
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro

# 启动MIMO
npm run dev
```

### .env 文件示例

```bash
# MIMO API 配置
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
ANTHROPIC_AUTH_TOKEN=tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5
ANTHROPIC_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
```

---

## ❓ 常见问题

### Q: 环境变量设置后仍报错？

**A**: 重新打开终端或运行 `source ~/.bashrc`

### Q: API Key在哪里获取？

**A**: 从MIMO控制台获取

### Q: 如何测试连接？

**A**: 使用curl命令测试（见上方验证配置）

### Q: 如何永久保存配置？

**A**: 添加到 `~/.bashrc` 或 `~/.zshrc`

---

## 🎯 总结

**必须设置**:
```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
```

**启动**:
```bash
npm run dev
```

**完整配置**:
```bash
export ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
export ANTHROPIC_AUTH_TOKEN=你的API Key
export ANTHROPIC_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_SONNET_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_OPUS_MODEL=mimo-v2.5-pro
export ANTHROPIC_DEFAULT_HAIKU_MODEL=mimo-v2.5-pro
npm run dev
```

---

**版本**: v2.0.0
**配置方式**: 环境变量
