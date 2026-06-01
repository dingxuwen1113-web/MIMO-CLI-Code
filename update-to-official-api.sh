#!/bin/bash
# 更新配置使用新的MiMo API端点

echo "=================================="
echo "  更新 MiMo API 配置"
echo "=================================="
echo ""
echo "将使用官方API端点:"
echo "  URL: https://api.xiaomimimo.com/v1/chat/completions"
echo "  认证: api-key header"
echo ""

# 备份当前配置
cp ~/.mimo/config.toml ~/.mimo/config.toml.backup
echo "✓ 已备份当前配置到: ~/.mimo/config.toml.backup"
echo ""

# 更新配置
cat > ~/.mimo/config.toml << 'EOF'
# MiMo API 配置
# 使用官方API端点，彻底解决429问题

[api]
provider = "mimo"            # 使用MiMo官方API
model = "mimo-v2.5-pro"
stream = true

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://api.xiaomimimo.com"  # 官方端点
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://api.xiaomimimo.com"  # 官方端点
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
echo "现在需要:"
echo "  1. 重新编译: npm run build"
echo "  2. 测试连接: ./test-mimo-api.sh"
echo "  3. 启动MIMO: npm run dev"
