# 映桥 · Osmo Bridge

面向 macOS 的 DJI Osmo 无线素材导入客户端，首个适配目标是 **Osmo Action 6**。

**当前状态：可构建、可启动的 0.1.0 原型，已完成本地协议/下载测试与界面检查；尚未完成 Action 6 素材传输实机验收。** 蓝牙握手、回放状态、分页及热点切换仍需按具体固件验证，不能将模拟设备测试视为实机支持承诺。

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

- 发现 DJI 蓝牙设备、相机屏幕配对、唤醒热点并取得可选名称提示、蓝牙保活。
- CoreWLAN 扫描热点，由用户选择并输入密码后加入；可在本机钥匙串记住密码，也支持系统 Wi-Fi 菜单手动接续。
- 原网络名称可读取时尝试恢复；恢复失败明确提示手动恢复。
- Go 实现 DUML CRC、UDP 数据链路、回放状态确认、双存储素材清单及分页。
- 照片/视频、内置存储/SD 卡筛选、文件名搜索、分页多选、缩略图。
- 原文件 HTTP 下载、串行队列、暂停、重试、Range 续传、长度校验、本地 SHA-256。
- 下载历史持久化，应用重启后未完成任务进入暂停状态，不自动开始传输。
- 原生目录选择与访达定位；中文界面与连接帮助。
- 设置与离线日志：保留天数、标准/详细级别、搜索筛选、过期/全部清理、诊断包导出。

不包含相机删除、格式化、云端上传、实时取景或自动转码。

## 构建与启动

需要 macOS 13 或更新版本、Xcode Command Line Tools、Go 1.27.0、Node.js 24。当前构建产物为本机架构（Apple Silicon）。

```sh
cd /Users/xvjialing/projects/osmo-bridge
sh scripts/setup.sh
sh scripts/build.sh
open "bin/Osmo Bridge.app"
```

依赖已安装时可直接执行 `sh scripts/build.sh`。开发运行：`sh scripts/dev.sh`，会构建前端与带图标的 `bin/dev/Osmo Bridge.app` 并启动，让系统权限正确归属应用。

Wails CLI 保存在 `.tools/wails3`，也可以运行 `sh scripts/env.sh .tools/wails3 task build`。工具缓存集中在 `.cache`，不提交到版本控制。

构建使用本地临时签名，没有 Developer ID 公证。发布给其他 Mac 前需配置正式签名、公证和对应架构构建。

## 使用

1. 相机开机、停止录像，并退出手机 DJI Mimo。
2. 点击“连接相机”→“搜索附近相机”，选择设备；首次在相机屏幕确认 OSMO 请求。
3. 允许系统提示的蓝牙、本地网络权限。点击蓝牙设备只配对并唤醒热点，不切换 Wi-Fi。首次扫描时允许定位授权，这是 macOS 读取热点名称的要求；映桥不采集位置。
4. 从列表选择相机热点，可展开其他热点；请与相机“系统设置 → 无线连接 → 无线信息”核对名称及密码。
5. 在弹窗输入密码，点击“连接此热点”后会立即在这台 Mac 上记住本次密码，无论认证、网络地址获取或素材连接是否成功。下次选择同一相机热点默认使用已记住的密码，也可修改或忘记。失败后可在系统菜单连接，再点击“我已连接相机 Wi-Fi，继续”。
6. 检查导入位置，选择素材并导入。已有目标文件不会被覆盖。
7. 传输中断可暂停、重新连接原相机并重试。完成后在“导入记录”查看 SHA-256 或定位文件。

确认加入热点会让 Mac 离开原 Wi-Fi；需要同时联网时可使用有线网络。macOS 限制读取 SSID 时，自动恢复原网络可能不可用，应用会提示手动恢复。

自动认证失败或素材握手失败后，映桥不会立即结束蓝牙会话或主动切回原网络；这样可以完成系统密码输入、等待 DHCP 地址分配，再继续素材通信。关闭连接面板不会取消会话；点击“取消本次连接”或退出应用才结束。系统本身仍可能在 Wi-Fi 认证失败时返回其他已知网络。

**手动连接限制：** 未取得可验证的设备标识时，每次手动连接使用独立会话目录，避免把不同相机中同名文件拼接。该模式只支持当前会话内暂停/续传，跨会话请重新导入到新目录；通过蓝牙连接的相机使用稳定设备标识。

默认目的目录：`~/Movies/OsmoBridge`。素材按相机标识摘要、存储位置和原 DCIM 路径归档。本地配置和历史位于 `~/Library/Application Support/OsmoBridge/settings.json`，不保存 Wi-Fi 密码。通过 `OSMO_BRIDGE_DATA` 可覆盖配置目录用于测试。

格式有效的密码提交后会在认证前自动存入 macOS 本机钥匙串；再次输入会覆盖旧密码，取消连接不会清除已保存的密码。不云同步，不进入诊断包。开发构建签名会变化，系统可能再次询问钥匙串访问授权；应用不会要求重新填写已保存的密码。若钥匙串访问被拒绝，会明确提示本次密码未能记住，仍可继续尝试连接。

## 断网时记录日志，联网后排查

左侧“设置”页面中可管理日志。连接相机 Wi-Fi 热点后，即使公网中断，记录、查看、搜索及导出仍然可用。

- 默认保留 **7 个自然日（包含今天）**，可改为 **1–90 天**。缩短期限时会先确认，再立即清理超期日志。
- 标准日志记录扫描、配对、Wi-Fi 切换、数据链路、连接中断/恢复、素材列表、下载结果等；“记录详细日志”增加握手次数、分页统计、HTTP 状态、续传偏移和重试信息。
- 同一次连接带有 `connection_id`，同一下载带有 `task_id`；可以在日志搜索框按编号查找关联事件。
- 日志目录为 `~/Library/Application Support/OsmoBridge/logs/`，设置在同级 `logging.json`。每个日志文件最多约 5 MiB，总量上限约 100 MiB；按天与大小滚动，容量不足时优先清理最旧记录。
- 清理过期日志/全部日志仅作用于本应用的诊断文件，保留素材、下载队列和导入历史。清理后会留下新的清理事件，后续操作继续记日志。
- “导出诊断包”让你选择本地目录，创建唯一 ZIP，不覆盖已有文件、不自动上传。包中包含保留期内全部会话日志、应用/Go/Wails/macOS 版本与构建信息，不受界面筛选影响。
- 不采集热点密码、配对标识、原始协议载荷和素材内容。已知 Wi-Fi 名称、设备标识、本地路径和 URL 参数在写盘前脱敏，导出时再次脱敏。

建议复现问题前开启详细日志，完成一次连接/传输尝试后恢复原网络，再从设置中导出诊断包。日志查看器按当前电脑时区显示时间，导出的事件采用 UTC 时间戳。应用诊断日志不等同于 macOS 系统崩溃报告或完整的原生标准错误输出。

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

日志界面夹具：`?fixture=logs&view=settings`；读取失败夹具：`?fixture=logs-error&view=settings`。这里的清理、设置和导出操作只模拟内存数据，不操作真实日志。

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
internal/diagnostics/      日志写入、滚动、保留、脱敏、查询和诊断包
logs_service.go            Wails 日志设置与本地导出接口
frontend/src/              React 界面、shadcn 组件、样式与测试夹具
scripts/                   安装、构建、运行及本地缓存环境
build/Info.plist           macOS 元数据与权限用途说明
```

## DHCP 与素材预览

若系统已连接相机热点，但映桥仍提示 IPv4 地址未就绪，请检查“系统设置 → Wi-Fi → 详细信息 → TCP/IP → 配置 IPv4”，选择“使用 DHCP”后重试。原网络使用固定 IP 时先记录原配置，切回后按需恢复；映桥只提示，不自动改动系统设置。

点击素材封面或文件名可打开预览。照片读取原 JPEG，视频支持播放、暂停和进度拖动；DNG 显示相机缩略预览。格式或编码不受支持时可导入原文件后用本机应用查看。关闭预览会释放播放器，原文件导入仍走下载队列。

`qa:build` 会生成明确标记的测试图片，并复制 `frontend/fixtures/preview-video.mp4`（FFmpeg testsrc2 生成的两秒 H.264 测试图案）到独立 QA 目录；生产构建不包含这些素材。`?fixture=connected` 可验证预览，`?fixture=preview-error` 可验证读取失败和重试。


相机 HTTP 404 表示文件读取失败，不能据此判断编码不兼容。当前预览会先检查文件响应，并区分读取失败和解码失败。视频默认尝试 `.LRF` 流畅预览，可切换“查看原视频”；原文件导入始终下载素材清单里的原文件，保留续传与完整性检查。

导出文件的“修改日期”保留相机清单中的拍摄时间，正常下载和断点续传均适用。清单未提供时区时按当前 Mac 的本地时区解释，与素材列表一致；文件内容和原始媒体元数据不做改写。时间无效或文件系统拒绝设置时会提示警告，仍保留已完整下载的文件。
