#!/bin/bash
# MIMO Token Plan 速率限制配置工具
# 调整RPM（每分钟请求数）和其他限制

echo "=================================="
echo "  MIMO Token Plan 速率限制配置"
echo "=================================="
echo ""
echo "当前配置:"
cat ~/.mimo/config.toml | grep -A 10 "\[api.tokenPlan\]"
echo ""
echo "请选择操作:"
echo ""
echo "1) 查看当前速率限制"
echo "2) 设置自定义RPM"
echo "3) 使用预设配置"
echo "4) 优化配置（推荐）"
echo "5) 重置为默认"
echo "6) 退出"
echo ""
read -p "请输入选项 (1-6): " choice

case $choice in
    1)
        echo ""
        echo "当前速率限制配置:"
        echo "=================================="
        echo ""
        echo "Token Plan 配置:"
        cat ~/.mimo/config.toml | grep -A 10 "\[api.tokenPlan\]"
        echo ""
        echo "代码中的默认配置 (rate-limiter.ts):"
        echo "  requestsPerMinute: 60 (60 RPM)"
        echo "  minIntervalMs: 0 (无延迟)"
        echo "  cooldownBaseMs: 2000 (2秒)"
        echo "  cooldownMaxMs: 30000 (30秒)"
        echo "  cooldownMultiplier: 2"
        echo "  maxRetries: 3"
        echo ""
        echo "说明:"
        echo "  - RPM = 每分钟请求数"
        echo "  - 共享Key的总RPM是固定的，所有用户共享"
        echo "  - 降低个人RPM可以减少429错误"
        ;;

    2)
        echo ""
        echo "设置自定义RPM"
        echo "=================================="
        echo ""
        echo "当前默认: 60 RPM"
        echo ""
        echo "建议值:"
        echo "  - 高频使用: 30 RPM"
        echo "  - 中频使用: 20 RPM"
        echo "  - 低频使用: 10 RPM"
        echo "  - 极低频: 5 RPM"
        echo ""
        read -p "请输入新的RPM值 (1-60): " rpm

        if [ "$rpm" -lt 1 ] || [ "$rpm" -gt 60 ]; then
            echo "❌ 无效的RPM值，请输入1-60"
            exit 1
        fi

        # 计算minIntervalMs
        interval=$((60000 / rpm))

        echo ""
        echo "新配置:"
        echo "  RPM: $rpm"
        echo "  最小间隔: ${interval}ms"
        echo ""

        read -p "确认应用? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            # 更新配置文件
            cat > ~/.mimo/config-rate.toml << EOF
# MIMO 速率限制配置
# 生成时间: $(date)

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

# 速率限制配置
# 注意: 这些配置需要在代码中设置
# RPM: $rpm
# 最小间隔: ${interval}ms
EOF

            echo "✓ 配置已保存到: ~/.mimo/config-rate.toml"
            echo ""
            echo "要应用此配置，请运行:"
            echo "  cp ~/.mimo/config-rate.toml ~/.mimo/config.toml"
            echo ""
            echo "注意: RPM限制需要在代码中修改 rate-limiter.ts"
        else
            echo "已取消"
        fi
        ;;

    3)
        echo ""
        echo "预设配置"
        echo "=================================="
        echo ""
        echo "1) 激进模式 (10 RPM) - 最少429错误"
        echo "2) 平衡模式 (20 RPM) - 推荐"
        echo "3) 高频模式 (30 RPM) - 快速响应"
        echo "4) 默认模式 (60 RPM) - 可能遇到429"
        echo ""
        read -p "请选择预设 (1-4): " preset

        case $preset in
            1)
                rpm=10
                interval=6000
                mode="激进模式"
                ;;
            2)
                rpm=20
                interval=3000
                mode="平衡模式"
                ;;
            3)
                rpm=30
                interval=2000
                mode="高频模式"
                ;;
            4)
                rpm=60
                interval=1000
                mode="默认模式"
                ;;
            *)
                echo "无效选项"
                exit 1
                ;;
        esac

        echo ""
        echo "选择: $mode"
        echo "  RPM: $rpm"
        echo "  最小间隔: ${interval}ms"
        echo ""

        read -p "确认应用? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            cat > ~/.mimo/config-rate.toml << EOF
# MIMO 速率限制配置
# 预设: $mode
# 生成时间: $(date)

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

# 速率限制配置
# 预设: $mode
# RPM: $rpm
# 最小间隔: ${interval}ms
EOF

            echo "✓ 配置已保存到: ~/.mimo/config-rate.toml"
            echo ""
            echo "要应用此配置，请运行:"
            echo "  cp ~/.mimo/config-rate.toml ~/.mimo/config.toml"
        else
            echo "已取消"
        fi
        ;;

    4)
        echo ""
        echo "优化配置（推荐）"
        echo "=================================="
        echo ""
        echo "针对共享Key的优化配置:"
        echo "  - 使用较小模型 (mimo-v2.5)"
        echo "  - 降低RPM到20"
        echo "  - 增加缓存时间"
        echo "  - 减少Token使用"
        echo ""

        read -p "确认应用优化配置? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

            cat > ~/.mimo/config.toml << 'EOF'
# MIMO 优化配置
# 针对共享Key RPM限制优化

[api]
mode = "token-plan"
model = "mimo-v2.5"          # 使用较小模型，减少Token消耗
stream = false               # 禁用流式，减少请求

[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
monthlyBudget = 999999999999

[api.payAsYouGo]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
maxTokensPerTurn = 16384     # 减少Token使用

[agent]
mode = "agent"               # 使用Agent模式（需确认）
maxTurns = 20                # 减少最大轮数
autoApproveReads = true

[promptCaching]
enabled = true
cacheTtl = 600               # 增加缓存时间到10分钟

[features]
enabled = true
disabledFeatures = []
EOF

            echo "✓ 优化配置已应用"
            echo ""
            echo "配置说明:"
            echo "  - 模型: mimo-v2.5 (较小)"
            echo "  - 流式: 禁用"
            echo "  - Token: 16384"
            echo "  - 最大轮数: 20"
            echo "  - 缓存时间: 10分钟"
            echo ""
            echo "备份已保存到: ~/.mimo/config.toml.backup"
            echo ""
            echo "现在运行: npm run dev"
        else
            echo "已取消"
        fi
        ;;

    5)
        echo ""
        echo "重置为默认配置"
        echo "=================================="
        echo ""

        read -p "确认重置? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            cp ~/.mimo/config.toml ~/.mimo/config.toml.backup

            cat > ~/.mimo/config.toml << 'EOF'
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

            echo "✓ 已重置为默认配置"
            echo ""
            echo "备份已保存到: ~/.mimo/config.toml.backup"
        else
            echo "已取消"
        fi
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
