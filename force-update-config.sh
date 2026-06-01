#!/bin/bash
# 强制更新MIMO配置
# 确保配置应用到全局

echo "=================================="
echo "  强制更新 MIMO 配置"
echo "=================================="
echo ""

# 备份当前配置
if [ -f ~/.mimo/config.toml ]; then
    cp ~/.mimo/config.toml ~/.mimo/config.toml.backup.$(date +%Y%m%d_%H%M%S)
    echo "✓ 已备份当前配置"
fi

# 创建新的配置文件
cat > ~/.mimo/config.toml << 'EOF'
# MIMO CLI 配置文件
# 使用官方API端点，彻底解决429问题

[api]
mode = "token-plan"
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
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

echo "✓ 已更新配置文件"
echo ""
echo "新配置:"
cat ~/.mimo/config.toml
echo ""
echo "=================================="
echo "  配置更新完成"
echo "=================================="
echo ""
echo "现在请运行:"
echo "  npm run dev"
echo ""
echo "如果仍有问题，请检查:"
echo "  1. API Key是否正确"
echo "  2. 网络连接是否正常"
echo "  3. API服务是否可用"
