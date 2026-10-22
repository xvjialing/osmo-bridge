# 交互约定

依据：PRODUCT.md；视觉规范：DESIGN.md。首版没有既有相邻界面，连接面板、素材视图和队列共同建立规范。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | App 素材选择 Set | 本文 | 当前页全选、单项 | UI 测试 |
| Form | 连接弹窗 + 共享 Input | PRODUCT.md | 蓝牙、已连接热点 | UI 测试 |
| Scrollbar | styles.css | DESIGN.md | 全局 | 浏览器检查 |
| Toast | App 内联 status/alert 区 | 本文 | 成功、错误 | UI 测试 |

## 状态与恢复

- 连接：未连接 → 扫描/配对/等待 Wi-Fi/读取 → 已连接；错误后可以重试。点击连接才会扫描和切换网络。
- Wi-Fi 自动连接失败时保留手动连接入口；恢复原网络失败要明确反馈，不静默忽略。
- 下载：排队 → 下载中 → 完成；可暂停，失败可重试。断开连接前暂停队列。完成状态必须来自本地完整文件。
- 后端持有可信媒体清单；前端只传 ID，不能传任意下载 URL。
- 页面筛选本地即时执行；IME 输入不触发提交。搜索框带清除按钮。筛选后重置页码。新会话清空选择。
- 显示选中总数，点击全选只选择当前页；点击下载添加准确数量，不重复创建同一任务。
- 持续错误在对应区域呈现，不能只放短暂通知。请求失效后不得覆盖新连接状态。
- 日期按相机本地日期展示，不擅自转换时区；界面 zh-CN，数值使用 Intl.NumberFormat。
- 连接弹窗草稿仅用于本次连接；密码隐藏且有显示切换；不持久化搜索和敏感状态到 URL。
- 按钮和复选框遵循键盘行为，dialog 使用 Radix，错误 role=alert，进度使用原生 progress。
- 没有相机删除、上传、格式化或付费功能；下载仅写用户选择的本地目录。
