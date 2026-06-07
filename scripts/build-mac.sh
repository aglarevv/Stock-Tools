#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="StockToolbox"

# ── 端口清理：杀掉占用 8765 的旧进程，避免构建后应用启动冲突 ──
if lsof -i :8765 -P -n 2>/dev/null | grep -q LISTEN; then
  echo "Port 8765 is in use — killing old server..."
  lsof -i :8765 -P -n 2>/dev/null | grep LISTEN | awk '{print $2}' | xargs kill 2>/dev/null || true
  sleep 1
  echo "Port 8765 freed"
fi
APP_DIR="$ROOT_DIR/build/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEB_RESOURCES_DIR="$RESOURCES_DIR/web"
SERVER_RESOURCES_DIR="$RESOURCES_DIR/server"

mkdir -p "$MACOS_DIR" "$WEB_RESOURCES_DIR" "$SERVER_RESOURCES_DIR"

# Build React frontend
echo "Building React frontend..."
(cd "$ROOT_DIR/react-app" && npx vite build)

swiftc \
  "$ROOT_DIR/react-app/macos/AppDelegate.swift" \
  -framework Cocoa \
  -framework WebKit \
  -o "$MACOS_DIR/$APP_NAME"

# Clean old web files before copying new ones
rm -rf "$WEB_RESOURCES_DIR"/*
cp "$ROOT_DIR/react-app/dist/index.html" "$WEB_RESOURCES_DIR/index.html"
cp "$ROOT_DIR/react-app/dist/icon.png" "$WEB_RESOURCES_DIR/icon.png"
cp -r "$ROOT_DIR/react-app/dist/assets" "$WEB_RESOURCES_DIR/assets"
# Bundle Node.js server with all JS dependencies (eliminates node_modules dependency hell)
echo "Bundling server..."
npx esbuild "$ROOT_DIR/src/server/server.js" \
  --bundle --platform=node \
  --external:mysql2 --external:sql.js --external:mammoth --external:pdf-parse \
  --outfile="$SERVER_RESOURCES_DIR/server.bundle.js" 2>&1

# Copy only native/WASM modules that can't be bundled
mkdir -p "$SERVER_RESOURCES_DIR/node_modules"
cp -r "$ROOT_DIR/node_modules/mysql2" "$SERVER_RESOURCES_DIR/node_modules/mysql2" 2>/dev/null || true
cp -r "$ROOT_DIR/node_modules/sql.js" "$SERVER_RESOURCES_DIR/node_modules/sql.js" 2>/dev/null || true
cp -r "$ROOT_DIR/node_modules/mammoth" "$SERVER_RESOURCES_DIR/node_modules/mammoth" 2>/dev/null || true
cp -r "$ROOT_DIR/node_modules/pdf-parse" "$SERVER_RESOURCES_DIR/node_modules/pdf-parse" 2>/dev/null || true
cp "$ROOT_DIR/src/server/server.js" "$SERVER_RESOURCES_DIR/server.js"  # keep original as fallback
cp "$ROOT_DIR/src/server/db.js" "$SERVER_RESOURCES_DIR/db.js"
cp "$ROOT_DIR/package.json" "$SERVER_RESOURCES_DIR/package.json"
cp "$ROOT_DIR/sources.opml" "$RESOURCES_DIR/sources.opml"

# 从应用图标 PNG 生成 .icns（与加载页/侧边栏图标一致）
ICON_SRC="$ROOT_DIR/react-app/public/icon.png"
if [ -f "$ICON_SRC" ] && [ -x "$(command -v sips)" ] && [ -x "$(command -v iconutil)" ]; then
  ICONSET="$ROOT_DIR/StockToolbox.iconset"
  rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  for s in 16 32 64 128 256 512 1024; do
    sips -z $s $s "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null 2>&1
    s=$((s*2)); sips -z $s $s "$ICON_SRC" --out "$ICONSET/icon_$((s/2))x$((s/2))@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$ICONSET" -o "$ROOT_DIR/StockToolbox.icns" 2>/dev/null && echo "Icon generated from $ICON_SRC"
fi

if [ -f "$ROOT_DIR/StockToolbox.icns" ]; then
  cp "$ROOT_DIR/StockToolbox.icns" "$RESOURCES_DIR/StockToolbox.icns"
  echo "Icon installed"
fi

cp "$ROOT_DIR/react-app/macos/Info.plist" "$CONTENTS_DIR/Info.plist"

# 注册图标到系统
touch "$APP_DIR"

plutil -lint "$CONTENTS_DIR/Info.plist"

# ── 代码混淆：混淆前端产物和服务端 bundle ──
echo "Obfuscating JavaScript files..."
node "$ROOT_DIR/scripts/obfuscate.js" "$WEB_RESOURCES_DIR/assets" "$SERVER_RESOURCES_DIR"
echo "Obfuscation complete."

# ── 代码签名（ad-hoc）—— 避免 Gatekeeper "已损坏" 错误 ──
echo "Signing app (ad-hoc)..."
codesign --force --deep --sign - "$APP_DIR" 2>/dev/null || echo "⚠ 签名失败（可能缺少 Xcode Command Line Tools），应用仍可用，首次打开请右键 → 打开"

echo "Built $APP_DIR"
