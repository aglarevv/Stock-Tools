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

# 检测架构并编译 Swift 壳
ARCH=$(uname -m)
echo "Building for architecture: $ARCH"
MIN_OS="14.0"  # 支持 macOS 14+ (包含 15)
SWIFT_FLAGS="-O -whole-module-optimization"
if [ "$ARCH" = "arm64" ]; then
  TARGET="${ARCH}-apple-macosx${MIN_OS}"
else
  TARGET="${ARCH}-apple-macosx${MIN_OS}"
fi
echo "Swift target: $TARGET"
swiftc \
  "$ROOT_DIR/react-app/macos/AppDelegate.swift" \
  -target "$TARGET" \
  $SWIFT_FLAGS \
  -framework Cocoa \
  -framework WebKit \
  -o "$MACOS_DIR/$APP_NAME"

# Clean old web files before copying new ones
rm -rf "$WEB_RESOURCES_DIR"/*
cp "$ROOT_DIR/react-app/dist/index.html" "$WEB_RESOURCES_DIR/index.html"
cp "$ROOT_DIR/react-app/dist/icon.png" "$WEB_RESOURCES_DIR/icon.png"
cp "$ROOT_DIR/react-app/dist/favicon.svg" "$WEB_RESOURCES_DIR/favicon.svg"
cp -r "$ROOT_DIR/react-app/dist/assets" "$WEB_RESOURCES_DIR/assets"
# Bundle Node.js server with all JS dependencies (eliminates node_modules dependency hell)
echo "Bundling server..."
npx esbuild "$ROOT_DIR/src/server/server.js" \
  --bundle --platform=node \
  --external:mysql2 --external:sql.js --external:mammoth --external:pdf-parse \
  --outfile="$SERVER_RESOURCES_DIR/server.bundle.js" 2>&1

# Copy only native/WASM modules that can't be bundled
mkdir -p "$SERVER_RESOURCES_DIR/node_modules"
# mysql2 及其所有传递依赖（运行时 require，esbuild 不打包）
for pkg in mysql2 sql-escaper denque generate-function is-property iconv-lite safer-buffer long lru.min named-placeholders aws-ssl-profiles; do
  cp -r "$ROOT_DIR/node_modules/$pkg" "$SERVER_RESOURCES_DIR/node_modules/$pkg" 2>/dev/null || true
done
# WASM / 原生模块（esbuild external）
cp -r "$ROOT_DIR/node_modules/sql.js" "$SERVER_RESOURCES_DIR/node_modules/sql.js" 2>/dev/null || true
cp -r "$ROOT_DIR/node_modules/mammoth" "$SERVER_RESOURCES_DIR/node_modules/mammoth" 2>/dev/null || true
cp -r "$ROOT_DIR/node_modules/pdf-parse" "$SERVER_RESOURCES_DIR/node_modules/pdf-parse" 2>/dev/null || true
cp "$ROOT_DIR/src/server/server.js" "$SERVER_RESOURCES_DIR/server.js"  # keep original as fallback
cp "$ROOT_DIR/src/server/db.js" "$SERVER_RESOURCES_DIR/db.js"
cp "$ROOT_DIR/src/server/keywords.js" "$SERVER_RESOURCES_DIR/keywords.js" 2>/dev/null || true
mkdir -p "$SERVER_RESOURCES_DIR/services"
cp "$ROOT_DIR/src/server/services/rss.js" "$SERVER_RESOURCES_DIR/services/rss.js" 2>/dev/null || true
cp "$ROOT_DIR/src/server/services/classifier.js" "$SERVER_RESOURCES_DIR/services/classifier.js" 2>/dev/null || true
# 复制其他服务文件
for sf in bridge.js stockSdk.js xuangutong.js reportAnalyzer.js utils.js; do
  cp "$ROOT_DIR/src/server/services/$sf" "$SERVER_RESOURCES_DIR/services/$sf" 2>/dev/null || true
done
# 复制 Python 桥接脚本（作为 PyInstaller 编译失败的降级）
cp "$ROOT_DIR/src/server/services/stock_bridge.py" "$SERVER_RESOURCES_DIR/services/stock_bridge.py" 2>/dev/null || true
# 复制 routes 目录
mkdir -p "$SERVER_RESOURCES_DIR/routes"
for rf in "$ROOT_DIR"/src/server/routes/*.js; do
  cp "$rf" "$SERVER_RESOURCES_DIR/routes/" 2>/dev/null || true
done
# 复制数据库相关
cp "$ROOT_DIR/src/server/database.js" "$SERVER_RESOURCES_DIR/database.js" 2>/dev/null || true
cp "$ROOT_DIR/src/server/dbSync.js" "$SERVER_RESOURCES_DIR/dbSync.js" 2>/dev/null || true
cp "$ROOT_DIR/src/server/newsDigest.js" "$SERVER_RESOURCES_DIR/newsDigest.js" 2>/dev/null || true
cp "$ROOT_DIR/package.json" "$SERVER_RESOURCES_DIR/package.json"
cp "$ROOT_DIR/sources.opml" "$RESOURCES_DIR/sources.opml"

# ── 构建 Python 独立可执行文件（PyInstaller，避免用户自行安装 Python） ──
echo "Building Python bridge (PyInstaller)..."
BUILD_DIR="$ROOT_DIR/src/server/services"
(
  cd "$BUILD_DIR" || exit 1
  python3 -m venv venv_build
  source venv_build/bin/activate
  pip install pyinstaller akshare baostock --quiet
  AKDIR=$(python3 -c "import akshare, os; print(os.path.dirname(akshare.__file__))")
  echo "AKShare data dir: $AKDIR/file_fold"
  pyinstaller --onefile --name stock_bridge --distpath "$SERVER_RESOURCES_DIR" \
    --add-data "$AKDIR/file_fold:akshare/file_fold/" \
    stock_bridge.py 2>&1 | tail -3
  rm -rf venv_build __pycache__ stock_bridge.spec build 2>/dev/null
) && echo "PyInstaller OK: $(ls -lh "$SERVER_RESOURCES_DIR/stock_bridge" 2>/dev/null)" || \
  echo "WARNING: PyInstaller failed, will fallback to system Python"

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

# ── 构建信息 ──
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_HASH=$(cd "$ROOT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
cat > "$RESOURCES_DIR/build-info.json" <<EOF
{"version":"3.0.0","buildDate":"$BUILD_DATE","commit":"$COMMIT_HASH","arch":"$ARCH","target":"$TARGET"}
EOF
echo "Build info: $(cat "$RESOURCES_DIR/build-info.json")"

# 注册图标到系统
touch "$APP_DIR"

plutil -lint "$CONTENTS_DIR/Info.plist"

# ── 代码混淆：混淆前端产物和服务端 bundle ──
echo "Obfuscating JavaScript files..."
node "$ROOT_DIR/scripts/obfuscate.js" "$WEB_RESOURCES_DIR/assets" "$SERVER_RESOURCES_DIR"
echo "Obfuscation complete."

# ── 代码签名（ad-hoc + entitlements）—— 避免 Gatekeeper 错误 ──
echo "Signing app (ad-hoc)..."
ENTITLEMENTS="$ROOT_DIR/react-app/macos/StockToolbox.entitlements"
if [ -f "$ENTITLEMENTS" ]; then
  echo "Using entitlements: $ENTITLEMENTS"
  codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" --timestamp=none "$APP_DIR" && echo "Signing OK (ad-hoc + entitlements)" || { echo "WARNING: codesign failed, app still usable (right-click -> Open)"; }
else
  codesign --force --deep --sign - --timestamp=none "$APP_DIR" && echo "Signing OK (ad-hoc, no entitlements)" || { echo "WARNING: codesign failed, app still usable (right-click -> Open)"; }
fi

echo "Built $APP_DIR"
