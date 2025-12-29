#!/bin/bash

set -e

echo "🚀 开始安装 CCToolbox..."
echo ""

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ 需要 Node.js >= 14.0.0"
    echo "   当前版本: $(node -v)"
    exit 1
fi

# 安装主项目依赖
echo "📦 安装主项目依赖..."
npm install

# 构建前端
echo "🔨 构建前端..."
cd src/web
npm install
npm run build
cd ../..

# 链接到全局
echo "🔗 链接到全局..."
npm link

echo ""
echo "✅ 安装完成！"
echo ""
echo "运行以下命令启动 Web UI:"
echo "  ct ui"
echo ""
