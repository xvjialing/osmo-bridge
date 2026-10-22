import {
  emptyState,
  type State,
  type Method,
  type Task,
  type LogInfo,
  type LogEntry,
  type LogSettings,
  type WiFiCandidate,
} from "./bridge";

// 仅由 test 构建加载；数据和动作都是显式标记的本地测试夹具。
const scenario = new URLSearchParams(location.search).get("fixture");
const state: State = {
  ...emptyState,
  warning: "本地测试夹具 · 虚拟相机，不会连接设备或写入素材",
  destination: "/测试目录/映桥",
  media: [],
  tasks: [],
};
if (
  scenario !== "disconnected" &&
  scenario !== "error" &&
  !scenario?.startsWith("wifi-")
) {
  state.phase = "connected";
  state.deviceName = "Action 6 · 虚拟设备";
  state.ssid = "TEST-OSMO";
  state.message = "测试连接已建立";
  if (scenario !== "empty")
    state.media = Array.from({ length: 30 }, (_, i) => ({
      id: `fixture-${i}`,
      name: `TEST_20261022_${String(i + 1).padStart(4, "0")}.${i % 3 === 0 ? "JPG" : "MP4"}`,
      path: `DCIM/TEST/${i}.MP4`,
      thumb: "",
      storage: i % 2,
      handle: i + 1,
      size: (i + 1) * 1048576,
      duration: i * 13,
      kind: i % 3 === 0 ? "photo" : "video",
      date: "2026-10-22 12:30:00",
    }));
}
const logInfo: LogInfo = {
  settings: { retentionDays: 7, level: "info" },
  directory: "/测试目录/OsmoBridge/logs",
  files: 4,
  bytes: 384920,
  maxBytes: 104857600,
  session: "a1b2c3d4e5f6",
  lastError: "",
};
let logEntries: LogEntry[] = Array.from({ length: 126 }, (_, i) => ({
  id: `test-log-${i}`,
  time: new Date(Date.UTC(2026, 9, 22, 11, 30, 0) - i * 10000).toISOString(),
  session: "a1b2c3d4e5f6",
  level: i % 5 === 0 ? "error" : i % 3 === 0 ? "warn" : "info",
  component: ["connection", "wifi", "datalink", "media", "transfer"][i % 5],
  event: [
    "connection.failed",
    "wifi.joined",
    "link.handshake_ready",
    "media.page_ready",
    "transfer.started",
  ][i % 5],
  message: [
    "相机未响应，请检查热点连接和本地网络权限",
    "已加入相机热点",
    "UDP 握手完成",
    "素材分页接收完成",
    "开始下载原始素材",
  ][i % 5],
  fields: {
    connection_id: "c8d1e2f3a456",
    elapsed_ms: String(320 + i * 10),
    attempt: "1",
  },
}));
if (scenario === "waiting-wifi" || scenario === "connection-error") {
  state.phase =
    scenario === "waiting-wifi" ? "waiting_wifi" : "connection_error";
  state.media = [];
  state.deviceName = "Action 6 · 虚拟设备";
  state.ssid = "TEST-OSMO";
  state.message =
    scenario === "waiting-wifi"
      ? "自动认证未完成，请在系统 Wi-Fi 菜单手动加入相机热点"
      : "热点已就绪，素材握手未响应";
}

const rememberedNetworks = new Set<string>(
  scenario === "wifi-saved" ? ["TEST-OsmoAction6-ABCD"] : [],
);
let connectionGeneration = 0;
function fixtureNetworks(): WiFiCandidate[] {
  if (scenario === "wifi-empty") return [];
  return [
    {
      ssid: "TEST-OsmoAction6-ABCD",
      rssi: -38,
      channel: 149,
      security: "WPA2",
      supported: true,
      likely: true,
      reason: "与相机蓝牙提供的热点名称一致",
      hasSavedPassword: rememberedNetworks.has("TEST-OsmoAction6-ABCD"),
    },
    {
      ssid: "TEST-OsmoAction-另一台相机",
      rssi: -69,
      channel: 36,
      security: "WPA2",
      supported: true,
      likely: true,
      reason: "名称包含 Osmo / DJI，需由你确认",
      hasSavedPassword: false,
    },
    {
      ssid: "TEST-改名后的相机热点",
      rssi: -52,
      channel: 6,
      security: "WPA2",
      supported: true,
      likely: false,
      reason: "其他附近热点，请核对相机无线信息",
      hasSavedPassword: false,
    },
    {
      ssid: "TEST-开放网络",
      rssi: -56,
      channel: 11,
      security: "开放网络",
      supported: false,
      likely: false,
      reason: "其他附近热点，请核对相机无线信息",
      hasSavedPassword: false,
    },
  ];
}
export async function fixtureCall(method: Method, args: unknown[]) {
  if (method === "GetLogInfo") return structuredClone(logInfo);
  if (method === "ReadLogs") {
    const q = args[0] as {
      level: string;
      search: string;
      before: string;
      limit: number;
    };
    if (scenario === "logs-error")
      throw new Error("测试错误：无法读取日志目录，请检查权限后重试");
    const filtered = logEntries.filter(
      (e) =>
        (q.level === "all" || !q.level || e.level === q.level) &&
        JSON.stringify(e).toLowerCase().includes(q.search.toLowerCase()),
    );
    const start = q.before
      ? Math.max(0, filtered.findIndex((e) => e.id === q.before) + 1)
      : 0;
    const entries = filtered.slice(start, start + q.limit);
    const hasMore = start + q.limit < filtered.length;
    return {
      entries,
      nextCursor: hasMore ? entries[entries.length - 1].id : "",
      hasMore,
      skipped: 0,
    };
  }
  if (method === "SaveLogSettings") {
    logInfo.settings = structuredClone(args[0] as LogSettings);
    return;
  }
  if (method === "CleanLogs") {
    const count = logInfo.files;
    const size = logInfo.bytes;
    if (args[0]) {
      logInfo.files = 1;
      logInfo.bytes = 240;
      logEntries = [
        {
          id: "test-cleared",
          time: new Date().toISOString(),
          session: logInfo.session,
          level: "info",
          component: "app",
          event: "logs.cleaned",
          message: "日志清理完成",
          fields: { files: String(count) },
        },
      ];
    }
    return { files: args[0] ? count : 0, bytes: args[0] ? size : 0 };
  }
  if (method === "ExportLogs") return "/测试目录/映桥诊断-测试.zip";
  if (method === "OpenLogDirectory") return;
  if (method === "GetState") return structuredClone(state);
  if (method === "Scan") {
    await new Promise((r) => setTimeout(r, 250));
    if (scenario === "error")
      throw new Error("测试错误：蓝牙权限未开启，请在系统设置中允许访问");
    return [{ id: "test-camera", name: "Action 6 · 虚拟设备", rssi: -42 }];
  }
  if (method === "PrepareCamera" || method === "ScanWiFi") {
    const generation = ++connectionGeneration;
    state.phase = method === "PrepareCamera" ? "preparing" : "choosing_wifi";
    state.busy = true;
    state.message = "测试：正在配对并扫描热点（不会切换 Wi-Fi）";
    state.wifiNetworks = [];
    state.deviceName = "Action 6 · 虚拟设备";
    state.ssid = "TEST-OsmoAction6-ABCD";
    setTimeout(() => {
      if (generation !== connectionGeneration) return;
      state.phase = "choosing_wifi";
      state.busy = false;
      state.wifiNetworks =
        scenario === "wifi-scan-error" ? [] : fixtureNetworks();
      state.message =
        scenario === "wifi-scan-error"
          ? "测试：扫描热点失败，请允许定位服务后重试"
          : "请选择相机热点，确认后才会切换 Wi-Fi";
    }, 400);
    return;
  }
  if (method === "ForgetWiFiPassword") {
    rememberedNetworks.delete(args[0] as string);
    state.wifiNetworks = fixtureNetworks();
    return;
  }
  if (method === "JoinCameraWiFi" || method === "Connect") {
    const generation = ++connectionGeneration;
    state.phase = "connecting";
    state.busy = true;
    state.message = "测试：正在认证热点并等待网络地址";
    if (method === "JoinCameraWiFi") state.ssid = args[0] as string;
    setTimeout(() => {
      if (generation !== connectionGeneration) return;
      state.busy = false;
      if (method === "JoinCameraWiFi" && args[1] === "FixtureWrong42") {
        state.phase = "waiting_wifi";
        state.message = "测试：热点认证失败，请核对密码";
        return;
      }
      if (method === "JoinCameraWiFi" && args[3]) {
        rememberedNetworks.add(args[0] as string);
        state.wifiNetworks = fixtureNetworks();
      }
      state.phase = "connected";
      state.message = "测试：已建立素材会话";
    }, 400);
    return;
  }
  if (method === "Disconnect") {
    connectionGeneration++;
    state.phase = "disconnected";
    state.busy = false;
    state.media = [];
    state.wifiNetworks = [];
    state.deviceName = "";
    state.ssid = "";
    state.message = "相机已断开";
    return;
  }
  if (method === "Refresh") return;
  if (method === "ChooseDestination") {
    state.destination = "/测试目录/新导入位置";
    return state.destination;
  }
  if (method === "Enqueue") {
    for (const id of args[0] as string[]) {
      const media = state.media.find((m) => m.id === id);
      if (media && !state.tasks.some((t) => t.id === id))
        state.tasks.push({
          id,
          media,
          device: "test-camera",
          root: state.destination,
          status: "downloading",
          progress: {
            bytes: media.size / 3,
            total: media.size,
            speed: 1024 * 1024,
          },
          error: "",
          path: "",
          sha256: "",
        } satisfies Task);
    }
    return;
  }
  if (method === "PauseAll") {
    state.tasks = state.tasks.map((t) => ({
      ...t,
      status: "paused",
      progress: { ...t.progress, speed: 0 },
    }));
    return;
  }
  if (method === "Retry") {
    state.tasks = state.tasks.map((t) =>
      t.id === args[0]
        ? {
            ...t,
            status: "failed",
            error: "测试错误：相机连接中断，临时文件已保留",
          }
        : t,
    );
    return;
  }
  throw new Error("测试夹具不执行文件系统操作");
}
