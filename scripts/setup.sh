#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sh scripts/env.sh go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.34
sh scripts/env.sh pnpm --dir frontend install --frozen-lockfile
sh scripts/env.sh go mod download
