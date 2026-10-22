#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sh scripts/env.sh npm --prefix frontend ci
sh scripts/env.sh node scripts/generate-icons.mjs
sh scripts/env.sh npm --prefix frontend run build
sh scripts/env.sh .tools/wails3 generate bindings -ts -i -names
mkdir -p "bin/Osmo Bridge.app/Contents/MacOS" "bin/Osmo Bridge.app/Contents/Resources"
sh scripts/env.sh go build -trimpath -tags production -ldflags="-s -w" -o "bin/Osmo Bridge.app/Contents/MacOS/osmo-bridge" .
cp build/Info.plist "bin/Osmo Bridge.app/Contents/Info.plist"
cp build/appicon.icns "bin/Osmo Bridge.app/Contents/Resources/appicon.icns"
cp THIRD_PARTY_NOTICES.md "bin/Osmo Bridge.app/Contents/Resources/"
cp -R licenses "bin/Osmo Bridge.app/Contents/Resources/"
codesign --force --sign - "bin/Osmo Bridge.app"
printf '%s\n' "构建完成：$PWD/bin/Osmo Bridge.app"
