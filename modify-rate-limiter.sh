#!/bin/bash
# 直接修改 rate-limiter.ts 中的速率限制配置

echo "=================================="
echo "  修改 rate-limiter.ts 速率限制"
echo "=================================="
echo ""
echo "当前配置 (rate-limiter.ts):"
grep -A 7 "const DEFAULT_CONFIG" src/api/rate-limiter.ts
echo ""
echo "请选择新的RPM值:"
echo ""
echo "1) 5 RPM   - 极低频（最少429错误）"
echo "2) 10 RPM  - 低频"
echo "3) 20 RPM  - 平衡（推荐）"
echo "4) 30 RPM  - 高频"
echo "5) 60 RPM  - 默认"
echo "6) 自定义值"
echo "7) 退出"
echo ""
read -p "请输入选项 (1-7): " choice

case $choice in
    1) rpm=5 ;;
    2) rpm=10 ;;
    3) rpm=20 ;;
    4) rpm=30 ;;
    5) rpm=60 ;;
    6)
        read -p "请输入自定义RPM值 (1-100): " rpm
        if [ "$rpm" -lt 1 ] || [ "$rpm" -gt 100 ]; then
            echo "❌ 无效的RPM值"
            exit 1
        fi
        ;;
    7)
        echo "退出"
        exit 0
        ;;
    *)
        echo "无效选项"
        exit 1
        ;;
esac

echo ""
echo "新配置:"
echo "  RPM: $rpm"
echo ""

read -p "确认修改? (y/n): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
fi

# 备份原文件
cp src/api/rate-limiter.ts src/api/rate-limiter.ts.backup

# 修改配置
sed -i "s/requestsPerMinute: [0-9]*/requestsPerMinute: $rpm/" src/api/rate-limiter.ts

echo ""
echo "✓ 已修改 rate-limiter.ts"
echo ""
echo "新配置:"
grep "requestsPerMinute" src/api/rate-limiter.ts
echo ""
echo "备份已保存到: src/api/rate-limiter.ts.backup"
echo ""
echo "现在需要重新编译:"
echo "  npm run build"
echo ""
echo "然后启动:"
echo "  npm run dev"
