#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sh scripts/env.sh node scripts/generate-icons.mjs
sh scripts/env.sh npm --prefix frontend run build
APP="bin/dev/Osmo Bridge.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
sh scripts/env.sh go build -o "$APP/Contents/MacOS/osmo-bridge" .
cp build/Info.plist "$APP/Contents/Info.plist"
cp build/appicon.icns "$APP/Contents/Resources/appicon.icns"
codesign --force --sign - "$APP"
# 本地验证构建与签名时可跳过启动，避免中断用户正在使用的客户端。
if [ "${OSMO_DEV_BUILD_ONLY:-0}" = "1" ]; then exit 0; fi
exec "$APP/Contents/MacOS/osmo-bridge"
