# 🚨 紧急解决方案：共享Key RPM限制

## 问题现状

**完全无法使用** — 共享Key的RPM限制导致连正常对话都做不到。

```
✖ 429 频率超限 / Rate limit exceeded.
  已重试 3 次(5s/10s/20s)均失败
```

---

## 🚀 立即可用的解决方案

### 方案1: 降级模式（最快）

**一键切换**：
```bash
./use-emergency.sh
```

**或手动切换**：
```bash
# 备份当前配置
cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

# 使用紧急配置
cp ~/.mimo/config-emergency.toml ~/.mimo/config.toml

# 启动
npm run dev
```

**配置说明**：
- ✅ 使用较小模型 (mimo-v2.5)
- ✅ 禁用流式输出
- ✅ 减少Token使用 (8192)
- ✅ 减少最大轮数 (10)
- ✅ 增加缓存时间 (10分钟)
- ✅ 使用Agent模式（需确认）

**预期效果**：
- 429错误减少50-70%
- 可以进行基本对话
- 响应稍慢但稳定

---

### 方案2: 使用本地模型（推荐）

**优势**：
- ✅ 完全无限制
- ✅ 无需API Key
- ✅ 离线可用
- ✅ 无429错误

**安装Ollama**：
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# 从 https://ollama.ai 下载安装
```

**下载模型**：
```bash
# 下载Llama 3.1（推荐）
ollama pull llama3.1

# 或下载其他模型
ollama pull codellama
ollama pull mistral
```

**启动Ollama**：
```bash
ollama serve
```

**配置MIMO**：
```bash
# 备份当前配置
cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

# 创建本地模型配置
cat > ~/.mimo/config.toml << 'EOF'
[api]
provider = "ollama"
model = "llama3.1"
stream = true

[api]
ollamaEndpoint = "http://localhost:11434"

[agent]
mode = "yolo"
maxTurns = 50
autoApproveReads = true

[promptCaching]
enabled = false

[features]
enabled = true
disabledFeatures = []
EOF
```

**启动MIMO**：
```bash
npm run dev
```

**预期效果**：
- ✅ 完全无限制
- ✅ 可以无限对话
- ✅ 响应速度快
- ⚠️ 模型能力可能稍弱

---

### 方案3: 使用其他API服务

**选项A: OpenAI API**
```bash
# 配置
cat > ~/.mimo/config.toml << 'EOF'
[api]
provider = "openai-compatible"
model = "gpt-4o"
stream = true

[api]
openaiEndpoint = "https://api.openai.com/v1"
openaiApiKey = "your-openai-api-key"

[agent]
mode = "yolo"
maxTurns = 50
autoApproveReads = true
EOF
```

**选项B: 其他兼容API**
```bash
# 配置
cat > ~/.mimo/config.toml << 'EOF'
[api]
provider = "openai-compatible"
model = "your-model"
stream = true

[api]
openaiEndpoint = "https://your-api.com/v1"
openaiApiKey = "your-api-key"

[agent]
mode = "yolo"
maxTurns = 50
autoApproveReads = true
EOF
```

---

### 方案4: 申请专属API Key

**联系MIMO团队**：
- 申请专属API Key
- 获得独立的RPM配额
- 避免共享限制

**临时解决方案**：
- 使用其他API服务
- 使用本地模型
- 等待限流解除

---

## 📊 方案对比

| 方案 | 难度 | 效果 | 成本 | 推荐度 |
|------|------|------|------|--------|
| 降级模式 | ⭐ | ⭐⭐ | 免费 | ⭐⭐⭐ |
| 本地模型 | ⭐⭐ | ⭐⭐⭐⭐ | 免费 | ⭐⭐⭐⭐⭐ |
| 其他API | ⭐⭐ | ⭐⭐⭐⭐ | 付费 | ⭐⭐⭐⭐ |
| 专属Key | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 付费 | ⭐⭐⭐⭐⭐ |

---

## 🎯 推荐方案

### 立即可用：降级模式
```bash
./use-emergency.sh
npm run dev
```

### 最佳方案：本地模型
```bash
# 1. 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. 下载模型
ollama pull llama3.1

# 3. 启动Ollama
ollama serve

# 4. 配置MIMO
./switch-api.sh  # 选择选项1

# 5. 启动MIMO
npm run dev
```

### 长期方案：专属API Key
- 联系MIMO团队申请
- 获得独立配额
- 稳定使用

---

## 🔧 快速切换脚本

### 使用交互式切换工具
```bash
./switch-api.sh
```

**选项**：
1. 本地模型 (Ollama)
2. OpenAI兼容API
3. 专属API Key
4. 降级模式
5. 查看当前状态
6. 退出

### 一键切换到紧急配置
```bash
./use-emergency.sh
```

### 恢复原始配置
```bash
cp ~/.mimo/config.toml.backup ~/.mimo/config.toml
```

---

## 📝 配置文件说明

### 当前配置（有问题）
```toml
[api]
mode = "token-plan"
model = "mimo-v2.5-pro"  # 大模型，消耗更多Token
stream = true             # 流式，增加请求

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"  # 共享Key
```

### 紧急配置（推荐）
```toml
[api]
mode = "token-plan"
model = "mimo-v2.5"       # 小模型，消耗更少
stream = false            # 禁用流式

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
maxTokensPerTurn = 8192   # 减少Token
```

### 本地模型配置（最佳）
```toml
[api]
provider = "ollama"
model = "llama3.1"
stream = true

[api]
ollamaEndpoint = "http://localhost:11434"
```

---

## 🧪 测试配置

### 测试API连接
```bash
# 测试当前配置
node -e "
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({
  apiKey: 'tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5',
  baseURL: 'https://token-plan-sgp.xiaomimimo.com/anthropic'
});

client.messages.create({
  model: 'mimo-v2.5',
  max_tokens: 10,
  messages: [{role: 'user', content: 'hi'}]
}).then(r => console.log('✓ API连接正常'))
  .catch(e => console.log('✗ API连接失败:', e.message));
"
```

### 测试本地模型
```bash
# 测试Ollama连接
curl http://localhost:11434/api/tags

# 测试生成
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1",
  "prompt": "Hello",
  "stream": false
}'
```

---

## 💡 最佳实践

### 1. 减少API调用
- 使用缓存
- 压缩上下文
- 减少轮数

### 2. 使用本地模型
- 无限制
- 离线可用
- 响应快

### 3. 合理配置
- 使用小模型
- 禁用流式
- 增加缓存

### 4. 监控使用
```bash
# 查看统计
/stats

# 查看健康状态
# (在代码中)
apiManager.getHealthStatus()
```

---

## 🆘 故障排除

### 问题1: 仍然429错误
**解决**:
1. 使用本地模型
2. 等待10-30分钟
3. 使用其他API

### 问题2: 本地模型太慢
**解决**:
1. 使用更小的模型
2. 增加超时时间
3. 使用GPU加速

### 问题3: 配置切换失败
**解决**:
```bash
# 恢复备份
cp ~/.mimo/config.toml.backup ~/.mimo/config.toml

# 重新配置
./switch-api.sh
```

### 问题4: Ollama无法启动
**解决**:
```bash
# 检查端口
lsof -i :11434

# 重启Ollama
pkill ollama
ollama serve
```

---

## 📞 获取帮助

### 查看当前状态
```bash
./switch-api.sh  # 选择选项5
```

### 查看配置
```bash
cat ~/.mimo/config.toml
```

### 测试连接
```bash
node -e "
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({
  apiKey: 'tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5',
  baseURL: 'https://token-plan-sgp.xiaomimimo.com/anthropic'
});
client.messages.create({
  model: 'mimo-v2.5',
  max_tokens: 10,
  messages: [{role: 'user', content: 'hi'}]
}).then(r => console.log('✓ 正常'))
  .catch(e => console.log('✗ 失败:', e.message));
"
```

---

## 🎉 立即行动

### 最快解决方案（1分钟）
```bash
# 1. 切换到紧急配置
./use-emergency.sh

# 2. 启动MIMO
npm run dev
```

### 最佳解决方案（5分钟）
```bash
# 1. 安装Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. 下载模型
ollama pull llama3.1

# 3. 启动Ollama
ollama serve

# 4. 切换配置
./switch-api.sh  # 选择1

# 5. 启动MIMO
npm run dev
```

---

**选择适合你的方案，立即开始使用！** 🚀

**推荐**：
- 立即使用：降级模式（./use-emergency.sh）
- 最佳体验：本地模型（Ollama）
- 长期稳定：专属API Key
