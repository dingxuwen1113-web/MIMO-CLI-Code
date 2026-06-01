#!/bin/bash
# MIMO API切换脚本
# 解决共享Key RPM限制问题

echo "=================================="
echo "  MIMO API 配置切换工具"
echo "=================================="
echo ""
echo "当前配置:"
cat ~/.mimo/config.toml | head -10
echo ""
echo "请选择配置方案:"
echo ""
echo "1) 本地模型 (Ollama) - 无限制，需要安装Ollama"
echo "2) OpenAI兼容API - 使用其他API服务"
echo "3) 专属API Key - 使用你自己的API Key"
echo "4) 降级模式 - 使用最小配置"
echo "5) 查看当前状态"
echo "6) 退出"
echo ""
read -p "请输入选项 (1-6): " choice

case $choice in
    1)
        echo ""
        echo "切换到本地模型..."
        if ! command -v ollama &> /dev/null; then
            echo "❌ Ollama未安装"
            echo ""
            echo "安装方法:"
            echo "  macOS/Linux: curl -fsSL https://ollama.ai/install.sh | sh"
            echo "  Windows: 从 https://ollama.ai 下载安装"
            echo ""
            echo "安装后运行:"
            echo "  ollama pull llama3.1"
            echo "  ollama serve"
            exit 1
        fi

        # 检查Ollama是否运行
        if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "❌ Ollama未运行"
            echo "请运行: ollama serve"
            exit 1
        fi

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

        echo "✓ 已切换到本地模型 (Ollama)"
        echo "✓ 配置已保存到 ~/.mimo/config.toml"
        echo ""
        echo "现在可以运行: npm run dev"
        ;;

    2)
        echo ""
        echo "切换到OpenAI兼容API..."
        echo ""
        read -p "请输入API端点 (如: https://api.openai.com/v1): " endpoint
        read -p "请输入API Key: " apikey
        read -p "请输入模型名称 (如: gpt-4o): " model

        # 备份当前配置
        cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

        cat > ~/.mimo/config.toml << EOF
[api]
provider = "openai-compatible"
model = "$model"
stream = true

[api]
openaiEndpoint = "$endpoint"
openaiApiKey = "$apikey"

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

        echo "✓ 已切换到OpenAI兼容API"
        echo "✓ 配置已保存到 ~/.mimo/config.toml"
        echo ""
        echo "现在可以运行: npm run dev"
        ;;

    3)
        echo ""
        echo "配置专属API Key..."
        echo ""
        read -p "请输入API模式 (token-plan/pay-as-you-go): " mode
        read -p "请输入API Key: " apikey
        read -p "请输入Base URL: " baseurl

        # 备份当前配置
        cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

        cat > ~/.mimo/config.toml << EOF
[api]
mode = "$mode"
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "$apikey"
baseUrl = "$baseurl"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "$apikey"
baseUrl = "$baseurl"
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

        echo "✓ 已配置专属API Key"
        echo "✓ 配置已保存到 ~/.mimo/config.toml"
        echo ""
        echo "现在可以运行: npm run dev"
        ;;

    4)
        echo ""
        echo "切换到降级模式..."
        echo ""

        # 备份当前配置
        cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

        cat > ~/.mimo/config.toml << 'EOF'
[api]
mode = "token-plan"
model = "mimo-v2.5"
stream = false

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
maxTokensPerTurn = 16384

[agent]
mode = "agent"
maxTurns = 20
autoApproveReads = true

[promptCaching]
enabled = true
cacheTtl = 600

[features]
enabled = true
disabledFeatures = []
EOF

        echo "✓ 已切换到降级模式"
        echo "  - 使用较小模型 (mimo-v2.5)"
        echo "  - 禁用流式输出"
        echo "  - 减少Token使用"
        echo "  - 增加缓存时间"
        echo ""
        echo "现在可以运行: npm run dev"
        ;;

    5)
        echo ""
        echo "当前配置状态:"
        echo "=================================="
        cat ~/.mimo/config.toml
        echo ""
        echo "=================================="
        echo ""
        echo "API连接测试..."

        # 测试API连接
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
" 2>&1
        ;;

    6)
        echo "退出"
        exit 0
        ;;

    *)
        echo "无效选项"
        exit 1
        ;;
esac
