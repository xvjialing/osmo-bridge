# 映桥 · Osmo Bridge

面向 macOS 的 DJI Osmo 无线素材导入客户端，首个适配目标是 **Osmo Action 6**。

**当前状态：可构建、可启动的 0.1.0 原型，已完成本地协议/下载测试与界面检查；尚未连接 Action 6 实机。** 蓝牙握手、回放状态、分页及热点切换仍需按具体固件验证，不能将模拟设备测试视为实机支持承诺。

## 技术栈

| 层次 | 版本 |
|---|---|
| Go | 1.27.0 |
| Wails V3 | v3.0.0-beta.34（2026-10-22 查询的最新 V3 发布版） |
| React | 19.3.1 |
| Tailwind CSS | 4.3.3 |
| shadcn/ui | CLI 4.22.1 生成的 Button、Input、Dialog、Checkbox；Radix 1.8.1 |
| Vite / TypeScript | 8.3.5 / 5.9.3 |
| 蓝牙 | tinygo.org/x/bluetooth 0.16.0，macOS CoreBluetooth |

## 已实现

- 发现 DJI 蓝牙设备、相机屏幕配对、获取热点信息、蓝牙保活。
- CoreWLAN 加入相机热点；失败时引导系统 Wi-Fi 菜单手动连接。
- 原网络名称可读取时尝试恢复；恢复失败明确提示手动恢复。
- Go 实现 DUML CRC、UDP 数据链路、回放状态确认、双存储素材清单及分页。
- 照片/视频、内置存储/SD 卡筛选、文件名搜索、分页多选、缩略图。
- 原文件 HTTP 下载、串行队列、暂停、重试、Range 续传、长度校验、本地 SHA-256。
- 下载历史持久化，应用重启后未完成任务进入暂停状态，不自动开始传输。
- 原生目录选择与访达定位；中文界面与连接帮助。

不包含相机删除、格式化、云端上传、实时取景或自动转码。

## 构建与启动

需要 macOS 13 或更新版本、Xcode Command Line Tools、Go 1.27.0、Node.js 24。当前构建产物为本机架构（Apple Silicon）。

```sh
cd /Users/xvjialing/projects/osmo-bridge
sh scripts/setup.sh
sh scripts/build.sh
open "bin/Osmo Bridge.app"
```

依赖已安装时可直接执行 `sh scripts/build.sh`。开发运行：`sh scripts/dev.sh`，会构建前端并启动 Go 应用；需要蓝牙时优先运行打包后的 `.app`，使系统权限归属应用。

Wails CLI 保存在 `.tools/wails3`，也可以运行 `sh scripts/env.sh .tools/wails3 task build`。工具缓存集中在 `.cache`，不提交到版本控制。

构建使用本地临时签名，没有 Developer ID 公证。发布给其他 Mac 前需配置正式签名、公证和对应架构构建。

## 使用

1. 相机开机、停止录像，并退出手机 DJI Mimo。
2. 点击“连接相机”→“搜索附近相机”，选择设备；首次在相机屏幕确认 OSMO 请求。
3. 允许系统提示的蓝牙和本地网络权限。自动加入热点失败时，先在 macOS Wi-Fi 菜单加入相机热点，再使用“连接已加入的相机热点”。
4. 检查导入位置，选择素材并导入。已有目标文件不会被覆盖。
5. 传输中断可暂停、重新连接原相机并重试。完成后在“导入记录”查看 SHA-256 或定位文件。

自动连接会让 Mac 离开原 Wi-Fi；需要同时联网时可使用有线网络。macOS 限制读取 SSID 时，自动恢复原网络可能不可用，应用会提示手动恢复。

**手动连接限制：** 未取得可验证的设备标识时，每次手动连接使用独立会话目录，避免把不同相机中同名文件拼接。该模式只支持当前会话内暂停/续传，跨会话请重新导入到新目录；通过蓝牙连接的相机使用稳定设备标识。

默认目的目录：`~/Movies/OsmoBridge`。素材按相机标识摘要、存储位置和原 DCIM 路径归档。本地配置和历史位于 `~/Library/Application Support/OsmoBridge/settings.json`，不保存 Wi-Fi 密码。通过 `OSMO_BRIDGE_DATA` 可覆盖配置目录用于测试。

SHA-256 是本地完整文件指纹；因相机接口未提供源端哈希，应用不会宣称已经完成相机端哈希比对。实机验收需与 USB 拷贝文件对比。

## 验证

```sh
sh scripts/env.sh go test -race ./...
sh scripts/env.sh go vet ./...
sh scripts/env.sh npm --prefix frontend run typecheck
sh scripts/env.sh npm --prefix frontend run build
```

界面测试夹具单独构建：

```sh
sh scripts/env.sh npm --prefix frontend run qa:build
sh scripts/env.sh npm --prefix frontend run qa:preview
```

打开 `http://127.0.0.1:34182/?fixture=connected`、`?fixture=empty`、`?fixture=error` 或 `?fixture=disconnected`。页面明确显示虚拟设备标识，所有动作只作用于内存。**这些夹具不会进入生产构建。**

测试覆盖和实机验收项目见 `docs/验证记录.md`。协议来源与许可见 `THIRD_PARTY_NOTICES.md`。

## 代码结构

### Logo 与 Dock 图标

矢量设计源：`assets/brand/logo.svg`。修改后执行：

```sh
sh scripts/env.sh node scripts/generate-icons.mjs
```

开发启动和打包脚本都会自动生成图标。`build/appicon.png` 内嵌于 Go 程序，负责 dev/直接运行二进制时的 Dock 图标；`build/appicon.icns` 复制进 `.app/Contents/Resources`，并由 Info.plist 引用。前端左上角和 favicon 同步生成。已启动的旧进程需退出后重新启动才能显示新图标。

```text
main.go / service.go       原生应用入口、Wails 服务、队列与配置
internal/camera/           DUML、BLE、UDP 会话、媒体清单
internal/transfer/         原文件下载与安全续传
internal/platform/         macOS Wi-Fi 桥接
frontend/src/              React 界面、shadcn 组件、样式与测试夹具
scripts/                   安装、构建、运行及本地缓存环境
build/Info.plist           macOS 元数据与权限用途说明
```
