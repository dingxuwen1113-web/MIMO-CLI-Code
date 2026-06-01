#!/bin/bash
# MIMO API 完整解决方案
# 解决API Key无效和429问题

echo "=================================="
echo "  MIMO API 完整解决方案"
echo "=================================="
echo ""
echo "当前状态:"
echo "  API Key: tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
echo "  状态: ❌ 无效 (401错误)"
echo ""
echo "请选择解决方案:"
echo ""
echo "1) 使用新的API Key"
echo "2) 使用OpenAI兼容API"
echo "3) 使用本地模型 (Ollama) - 推荐"
echo "4) 使用其他AI服务"
echo "5) 申请新的MiMo API Key"
echo "6) 退出"
echo ""
read -p "请输入选项 (1-6): " choice

case $choice in
    1)
        echo ""
        echo "使用新的API Key"
        echo "=================================="
        echo ""
        read -p "请输入新的MiMo API Key: " new_key

        if [ -z "$new_key" ]; then
            echo "❌ API Key不能为空"
            exit 1
        fi

        # 测试新Key
        echo ""
        echo "测试新API Key..."
        response=$(curl -s -w "\n%{http_code}" --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
          --header "api-key: $new_key" \
          --header "Content-Type: application/json" \
          --data-raw '{
            "messages": [{"role": "user", "content": "Hello"}],
            "model": "mimo-v2.5-pro",
            "max_completion_tokens": 100,
            "stream": false
          }' \
          --max-time 10 \
          2>/dev/null)

        http_code=$(echo "$response" | tail -n1)

        if [ "$http_code" = "200" ]; then
            echo "✅ API Key有效！"
            echo ""

            # 更新配置
            cat > ~/.mimo/config.toml << EOF
[api]
provider = "mimo"
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "$new_key"
baseUrl = "https://api.xiaomimimo.com"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "$new_key"
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

            echo "✓ 配置已更新"
            echo ""
            echo "现在运行:"
            echo "  npm run build"
            echo "  npm run dev"
        else
            echo "❌ API Key无效 (HTTP: $http_code)"
            echo ""
            echo "请检查API Key是否正确"
        fi
        ;;

    2)
        echo ""
        echo "使用OpenAI兼容API"
        echo "=================================="
        echo ""
        echo "支持的API服务:"
        echo "  1. OpenAI (GPT-4, GPT-3.5)"
        echo "  2. Azure OpenAI"
        echo "  3. 其他兼容API"
        echo ""
        read -p "请输入API端点 (如: https://api.openai.com/v1): " endpoint
        read -p "请输入API Key: " apikey
        read -p "请输入模型名称 (如: gpt-4o): " model

        # 更新配置
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

        echo "✓ 配置已更新"
        echo ""
        echo "现在运行:"
        echo "  npm run build"
        echo "  npm run dev"
        ;;

    3)
        echo ""
        echo "使用本地模型 (Ollama) - 推荐"
        echo "=================================="
        echo ""
        echo "这是最佳解决方案:"
        echo "  ✅ 完全免费"
        echo "  ✅ 无API限制"
        echo "  ✅ 离线可用"
        echo "  ✅ 无429错误"
        echo ""

        # 检查Ollama是否安装
        if command -v ollama &> /dev/null; then
            echo "✓ Ollama已安装"
        else
            echo "❌ Ollama未安装"
            echo ""
            echo "安装方法:"
            echo "  macOS/Linux: curl -fsSL https://ollama.ai/install.sh | sh"
            echo "  Windows: 从 https://ollama.ai 下载安装"
            echo ""
            read -p "是否现在安装? (y/n): " install_ollama
            if [ "$install_ollama" = "y" ] || [ "$install_ollama" = "Y" ]; then
                curl -fsSL https://ollama.ai/install.sh | sh
            else
                echo "请手动安装Ollama后重试"
                exit 1
            fi
        fi

        # 检查Ollama是否运行
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "✓ Ollama正在运行"
        else
            echo "⚠️  Ollama未运行"
            echo ""
            echo "请在新终端运行: ollama serve"
            echo ""
            read -p "是否现在启动Ollama? (y/n): " start_ollama
            if [ "$start_ollama" = "y" ] || [ "$start_ollama" = "Y" ]; then
                ollama serve &
                sleep 3
            fi
        fi

        # 下载模型
        echo ""
        echo "下载模型..."
        echo "推荐: llama3.1 (通用)"
        echo ""
        read -p "是否下载llama3.1? (y/n): " download_model
        if [ "$download_model" = "y" ] || [ "$download_model" = "Y" ]; then
            ollama pull llama3.1
        fi

        # 更新配置
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

        echo ""
        echo "✓ 配置已更新"
        echo ""
        echo "现在运行:"
        echo "  npm run build"
        echo "  npm run dev"
        ;;

    4)
        echo ""
        echo "使用其他AI服务"
        echo "=================================="
        echo ""
        echo "可用的AI服务:"
        echo "  1. Anthropic (Claude)"
        echo "  2. Google (Gemini)"
        echo "  3. Mistral"
        echo "  4. 其他"
        echo ""
        read -p "请选择服务 (1-4): " service

        case $service in
            1)
                echo ""
                echo "Anthropic Claude配置"
                read -p "请输入Anthropic API Key: " anthropic_key
                cat > ~/.mimo/config.toml << EOF
[api]
provider = "anthropic"
model = "claude-3-5-sonnet-20241022"
stream = true

[api]
anthropicApiKey = "$anthropic_key"

[agent]
mode = "yolo"
maxTurns = 50
autoApproveReads = true
EOF
                ;;
            2)
                echo ""
                echo "Google Gemini配置"
                read -p "请输入Google API Key: " google_key
                cat > ~/.mimo/config.toml << EOF
[api]
provider = "openai-compatible"
model = "gemini-pro"
stream = true

[api]
openaiEndpoint = "https://generativelanguage.googleapis.com/v1beta/openai"
openaiApiKey = "$google_key"

[agent]
mode = "yolo"
maxTurns = 50
autoApproveReads = true
EOF
                ;;
            *)
                echo "请手动配置"
                exit 1
                ;;
        esac

        echo "✓ 配置已更新"
        echo ""
        echo "现在运行:"
        echo "  npm run build"
        echo "  npm run dev"
        ;;

    5)
        echo ""
        echo "申请新的MiMo API Key"
        echo "=================================="
        echo ""
        echo "步骤:"
        echo "  1. 访问 https://xiaomimimo.com"
        echo "  2. 登录账号"
        echo "  3. 进入API管理页面"
        echo "  4. 生成新的API Key"
        echo "  5. 复制API Key"
        echo ""
        echo "获取API Key后，运行:"
        echo "  ./configure-api.sh  # 选择选项1"
        echo ""
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
