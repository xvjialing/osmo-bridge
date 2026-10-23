---
version: alpha
name: 映桥
description: 面向相机素材导入的中文 macOS 工作台
colors:
  primary: "#245BDB"
  background: "#F4F6FA"
  foreground: "#202B40"
  muted: "#64748B"
  surface: "#FFFFFF"
  border: "#DDE3ED"
  success: "#137454"
  danger: "#B42336"
typography:
  sans:
    fontFamily: '"SF Pro Text", "PingFang SC", system-ui, sans-serif'
  display:
    fontFamily: '"SF Pro Display", "PingFang SC", system-ui, sans-serif'
  mono:
    fontFamily: '"SF Mono", ui-monospace, monospace'
rounded:
  DEFAULT: "0.625rem"
  lg: "1rem"
spacing:
  section: "1.5rem"
components:
  button: {}
  input: {}
  dialog: {}
  checkbox: {}
---

# 映桥设计约定

## Overview

中文桌面工具，主要任务是从相机导入原始素材。视觉取自摄影工作台的浅灰金属表面和蓝色连接指示灯；不采用营销落地页结构。唯一视觉标识是相机—电脑的细线连接轨迹，所有其余元素保持安静、清晰。使用系统字体，不下载外部字体。

## Colors

浅灰背景、白色素材面板、深蓝灰文本。蓝色用于当前操作和选择，绿色只表示连接或传输已完成，红色用于错误。`frontend/src/styles.css` 的 CSS 变量为运行时唯一来源，本文件镜像接受的值；Tailwind `@theme inline` 只做语义映射。

## Typography

正文采用 sans 字体族，标题用 display，文件大小、速度和文件名使用 mono。中文行高 1.6。标题 24px，正文 14px，辅助信息 12px。

## Layout

桌面为 228px 相机栏、弹性素材区、300px 队列。小于 1180px 队列落到素材区下方；小于 760px 连接栏变为顶部区。桌面素材网格有自己的滚动区；窄屏文档自然滚动。素材每页 24 项，筛选不改变已选素材，刷新和连接切换清空选择。

设置页沿用侧栏和标题区，内容是自然高度的两块白色面板：上方日志保留与记录级别，下方日志查看器。设置控件与状态说明并列，窄窗口上下排列；日志表格独立横向滚动，长消息可展开，不裁切操作按钮。日志错误、警告、正常事件均同时使用文字标签与颜色，延续现有语义色。设置页不沿用素材网格的定高滚动。

## Elevation & Depth

边框与色阶为主；连接弹窗使用轻阴影，静态区域不堆叠悬浮卡片。禁止装饰性大渐变和假缩略图。

## Shapes

控件 10px，主面板 16px，图标使用 lucide-react 的 1.7px 描边。相机示意使用代码绘制的结构图而非品牌素材。

### 应用标识

“双画幅跨接”：两个错位圆角画幅通过斜向笔画连接，分别代表相机和电脑；白色为源画幅，浅蓝色为接收画幅。沿用蓝色主色，Dock 底板使用同色系轻微明暗变化，单色化后轮廓仍然成立。没有文字或细小无线波纹，避免小尺寸模糊。

唯一矢量源为 `assets/brand/logo.svg`。1024px 画布中的底板为 832px，保留透明外边距，与其他 macOS Dock 图标的视觉尺寸一致。`scripts/generate-icons.mjs` 自动输出 PNG、16–1024px iconset、ICNS 和前端标识，禁止分别手改生成文件。

运行时由 Wails `Options.Icon` 读取内嵌 PNG，因此直接运行也有 Dock 图标；dev 和发布均构建 app bundle，以正确承载系统权限，同时使用 `CFBundleIconFile` 引用 ICNS，使 Finder 和启动台可识别图标。界面左上角同步采用同一标识。

## Components

共享控件位于 components/ui，采用 shadcn/ui。按钮明确 hover、focus-visible、disabled、busy，忙碌时宽度不变。弹窗有标题、描述、焦点管理和 Escape 行为。状态由文字和图标共同表达。滚动条全局定义 thumb、track、hover、active 和 forced-colors。动画仅用于连接或传输状态，遵循 reduced-motion。

## Do's and Don'ts

连接向导沿用共享 Dialog、Button、Input，最多 560px 宽，高度不足时内部滚动。顶部三步细线进度明确当前阶段；热点名称可换行，辅助信息分层，并用文字说明匹配依据。密码框与独立显示按钮并列，辅助文字说明提交后自动记住、不依赖连接结果；记忆状态使用图标和文字，不显示密码占位值。系统菜单接续默认收起，保留焦点恢复、错误及忙碌状态规范。

- 显示真实连接和下载状态，未连接时给出连接步骤。
- 相机不可用和无素材是不同状态；错误保留重试入口。
- 不显示未经测量的传输速度、存储容量或连接成功。
- 不向最终用户暴露协议偏移量与调试命令。

素材预览使用共享 Dialog，最大宽度 1040px、最大高度 90vh，过长内容在弹窗内滚动；深色画布承托照片与视频，原生播放器保留完整控件。卡片封面和文件名可点击并显示键盘焦点，选择框维持独立操作。

素材卡片的封面固定 120px 高，图像铺满裁切且不能溢出；文件名固定两行（32px）并顶端对齐，超长省略，可点击预览查看完整名称。大小/存储和日期各占 16px，信息行间距 4px；横图、竖图、方图和不同长度名称保持卡片信息对齐。

素材区标题右侧提供“网格 / 时间线”分段按钮，默认网格，沿用现有筛选按钮的选中蓝色与键盘焦点。时间线以细竖线、日期节点和日期标题组织卡片，复用同一素材卡片组件；日期旁仅显示本页分组数量。窄屏按钮可换行，素材网格仍为两列，滚动沿用素材区既有约定。
