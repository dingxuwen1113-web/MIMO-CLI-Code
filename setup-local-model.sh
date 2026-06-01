#!/bin/bash
# 一键配置使用本地模型
# 最快解决方案，无需API Key

echo "=================================="
echo "  一键配置本地模型"
echo "=================================="
echo ""
echo "这是最快的解决方案:"
echo "  ✅ 无需API Key"
echo "  ✅ 完全免费"
echo "  ✅ 无限制"
echo "  ✅ 离线可用"
echo ""

# 检查Ollama
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama未安装"
    echo ""
    echo "正在安装Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
fi

# 检查Ollama是否运行
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "⚠️  Ollama未运行"
    echo ""
    echo "请在新终端运行:"
    echo "  ollama serve"
    echo ""
    echo "然后运行此脚本"
    exit 1
fi

echo "✓ Ollama已安装并运行"

# 检查模型
echo ""
echo "检查模型..."
if ollama list | grep -q "llama3.1"; then
    echo "✓ llama3.1已安装"
else
    echo "下载llama3.1..."
    ollama pull llama3.1
fi

# 更新配置
echo ""
echo "更新MIMO配置..."
cat > ~/.mimo/config.toml << 'EOF'
# MIMO 配置 - 使用本地模型
# 无需API Key，完全免费，无限制

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

echo "✓ 配置已更新"
echo ""
echo "=================================="
echo "  配置完成！"
echo "=================================="
echo ""
echo "现在运行:"
echo "  npm run build"
echo "  npm run dev"
echo ""
echo "如果没有安装Ollama，请:"
echo "  1. 安装: curl -fsSL https://ollama.ai/install.sh | sh"
echo "  2. 启动: ollama serve"
echo "  3. 下载模型: ollama pull llama3.1"
