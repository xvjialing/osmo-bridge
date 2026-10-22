#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sh scripts/env.sh node scripts/generate-icons.mjs
sh scripts/env.sh npm --prefix frontend run build
exec sh scripts/env.sh go run .
