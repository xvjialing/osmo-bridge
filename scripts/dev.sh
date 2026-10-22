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
exec "$APP/Contents/MacOS/osmo-bridge"
