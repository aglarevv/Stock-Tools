#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="StockToolbox"
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
echo "Built $APP_DIR"
