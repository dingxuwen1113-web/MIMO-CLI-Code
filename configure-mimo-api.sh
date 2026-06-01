#!/bin/bash
# 配置MIMO API连接
# 使用官方环境变量方式

echo "=================================="
echo "  配置 MIMO API 连接"
echo "=================================="
echo ""
echo "使用官方环境变量配置方式:"
echo "  ANTHROPIC_BASE_URL - API端点"
echo "  ANTHROPIC_AUTH_TOKEN - API Key"
echo "  ANTHROPIC_MODEL - 模型名称"
echo ""

# 获取用户输入
read -p "请输入API Key: " api_key
read -p "请输入Base URL (默认: https://token-plan-sgp.xiaomimimo.com/anthropic): " base_url
read -p "请输入模型 (默认: mimo-v2.5-pro): " model

# 设置默认值
base_url=${base_url:-"https://token-plan-sgp.xiaomimimo.com/anthropic"}
model=${model:-"mimo-v2.5-pro"}

echo ""
echo "配置信息:"
echo "  API Key: ${api_key:0:20}..."
echo "  Base URL: $base_url"
echo "  Model: $model"
echo ""

read -p "确认配置? (y/n): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
fi

# 创建环境变量文件
cat > ~/.mimo/.env << EOF
# MIMO API 配置
ANTHROPIC_BASE_URL=$base_url
ANTHROPIC_AUTH_TOKEN=$api_key
ANTHROPIC_MODEL=$model
ANTHROPIC_DEFAULT_SONNET_MODEL=$model
ANTHROPIC_DEFAULT_OPUS_MODEL=$model
ANTHROPIC_DEFAULT_HAIKU_MODEL=$model
EOF

echo "✓ 环境变量已保存到: ~/.mimo/.env"
echo ""

# 更新shell配置
SHELL_RC="$HOME/.bashrc"
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

# 检查是否已存在
if ! grep -q "ANTHROPIC_BASE_URL" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# MIMO API 配置" >> "$SHELL_RC"
    echo "export ANTHROPIC_BASE_URL=\"$base_url\"" >> "$SHELL_RC"
    echo "export ANTHROPIC_AUTH_TOKEN=\"$api_key\"" >> "$SHELL_RC"
    echo "export ANTHROPIC_MODEL=\"$model\"" >> "$SHELL_RC"
    echo "export ANTHROPIC_DEFAULT_SONNET_MODEL=\"$model\"" >> "$SHELL_RC"
    echo "export ANTHROPIC_DEFAULT_OPUS_MODEL=\"$model\"" >> "$SHELL_RC"
    echo "export ANTHROPIC_DEFAULT_HAIKU_MODEL=\"$model\"" >> "$SHELL_RC"
    echo "✓ 已添加到 $SHELL_RC"
else
    echo "⚠ 环境变量已存在于 $SHELL_RC"
fi

echo ""
echo "=================================="
echo "  配置完成"
echo "=================================="
echo ""
echo "请运行以下命令使配置生效:"
echo "  source $SHELL_RC"
echo ""
echo "或重新打开终端"
echo ""
echo "然后启动MIMO:"
echo "  npm run dev"
