#!/bin/sh
# 所有工具缓存留在工程内，避免依赖开发机的全局可写目录。
PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOPATH="$PROJECT_ROOT/.cache/gopath"
export GOMODCACHE="$PROJECT_ROOT/.cache/gomod"
export GOCACHE="$PROJECT_ROOT/.cache/go-build"
export GOBIN="$PROJECT_ROOT/.tools"
export npm_config_cache="$PROJECT_ROOT/.cache/npm"
export MACOSX_DEPLOYMENT_TARGET=13.0
export CGO_CFLAGS="-mmacosx-version-min=13.0"
export CGO_LDFLAGS="-mmacosx-version-min=13.0"
export PATH="$GOBIN:$PATH"
cd "$PROJECT_ROOT"
exec "$@"
