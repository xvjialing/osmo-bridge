#!/bin/sh
# Go 工具与缓存留在工程内；pnpm 使用默认共享存储，便于跨项目复用依赖。
PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOPATH="$PROJECT_ROOT/.cache/gopath"
export GOMODCACHE="$PROJECT_ROOT/.cache/gomod"
export GOCACHE="$PROJECT_ROOT/.cache/go-build"
export GOBIN="$PROJECT_ROOT/.tools"
export MACOSX_DEPLOYMENT_TARGET=13.0
export CGO_CFLAGS="-mmacosx-version-min=13.0"
export CGO_LDFLAGS="-mmacosx-version-min=13.0"
export PATH="$GOBIN:$PATH"
cd "$PROJECT_ROOT"
exec "$@"
