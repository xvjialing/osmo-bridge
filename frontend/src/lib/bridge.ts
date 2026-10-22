export interface Media {
  id: string;
  name: string;
  path: string;
  thumb: string;
  storage: number;
  handle: number;
  size: number;
  duration: number;
  kind: string;
  date: string;
}
export interface Task {
  id: string;
  media: Media;
  device: string;
  root: string;
  status: string;
  progress: { bytes: number; total: number; speed: number };
  error: string;
  path: string;
  sha256: string;
}
export interface WiFiCandidate {
  ssid: string; rssi: number; channel: number; security: string; supported: boolean;
  likely: boolean; reason: string; hasSavedPassword: boolean;
}
export interface State {
  wifiNetworks: WiFiCandidate[];
  phase: string;
  message: string;
  warning: string;
  deviceName: string;
  ssid: string;
  destination: string;
  media: Media[];
  tasks: Task[];
  busy: boolean;
}
export interface Device {
  id: string;
  name: string;
  rssi: number;
}
export type Method =
  | "GetState"
  | "Scan"
  | "Connect"
  | "PrepareCamera"
  | "ScanWiFi"
  | "JoinCameraWiFi"
  | "ForgetWiFiPassword"
  | "Disconnect"
  | "Refresh"
  | "Enqueue"
  | "PauseAll"
  | "Retry"
  | "Reveal"
  | "ChooseDestination"
  | "GetLogInfo"
  | "ReadLogs"
  | "SaveLogSettings"
  | "CleanLogs"
  | "OpenLogDirectory"
  | "ExportLogs";
declare global {
  interface Window {
    __OSMO_TEST__?: (method: Method, args: unknown[]) => Promise<unknown>;
    _wails?: unknown;
    chrome?: { webview?: unknown };
    webkit?: { messageHandlers?: unknown };
  }
}
export const emptyState: State = {
  phase: "disconnected",
  wifiNetworks: [],
  message: "连接相机，开始导入原始素材",
  warning: "",
  deviceName: "",
  ssid: "",
  destination: "选择本地导入位置",
  media: [],
  tasks: [],
  busy: false,
};
const isNative = Boolean(
  window._wails || window.webkit?.messageHandlers || window.chrome?.webview,
);

export async function call<T>(method: Method, ...args: unknown[]): Promise<T> {
  if (
    import.meta.env.MODE === "test" &&
    new URLSearchParams(location.search).has("fixture")
  ) {
    const { fixtureCall } = await import("./test-fixture");
    return (await fixtureCall(method, args)) as T;
  }
  if (import.meta.env.MODE === "test" && window.__OSMO_TEST__)
    return (await window.__OSMO_TEST__(method, args)) as T;
  if (!isNative) {
    if (method === "GetState")
      return {
        ...emptyState,
        warning: "浏览器界面预览 · 连接相机和导入文件请使用桌面应用",
      } as T;
    throw new Error("请在映桥桌面应用中使用此功能");
  }
  const { Call } = await import("@wailsio/runtime");
  return (await Call.ByName(`main.BridgeService.${method}`, ...args)) as T;
}

export function bytes(n: number) {
  if (!n) return "0 B";
  const unit = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(n / 1024 ** unit)} ${["B", "KB", "MB", "GB"][unit]}`;
}
export function duration(n: number) {
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
export function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === "string"
      ? e
      : "操作未完成，请重试";
}

export interface LogSettings {
  retentionDays: number;
  level: "info" | "debug";
}
export interface LogInfo {
  settings: LogSettings;
  directory: string;
  files: number;
  bytes: number;
  maxBytes: number;
  session: string;
  lastError: string;
}
export interface LogEntry {
  id: string;
  time: string;
  session: string;
  level: string;
  component: string;
  event: string;
  message: string;
  fields?: Record<string, string>;
}
export interface LogPage {
  entries: LogEntry[];
  nextCursor: string;
  hasMore: boolean;
  skipped: number;
}
export interface CleanupResult {
  files: number;
  bytes: number;
}
