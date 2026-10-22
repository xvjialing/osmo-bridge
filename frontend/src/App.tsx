import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bluetooth,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Folder,
  FolderOpen,
  History,
  Image as ImageIcon,
  Info,
  Laptop,
  Library,
  LoaderCircle,
  Pause,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  Video,
  Wifi,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bytes,
  call,
  duration,
  emptyState,
  errorMessage,
  type Device,
  type Media,
  type State,
  type Task,
} from "@/lib/bridge";

const labels: Record<string, string> = {
  queued: "等待下载",
  downloading: "正在下载",
  paused: "已暂停",
  failed: "下载失败",
  completed: "已完成",
};

function Thumbnail({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="media-visual">
      {media.thumb && !failed ? (
        <img
          loading="lazy"
          alt=""
          src={`/camera-thumbnail/${media.id}`}
          onError={() => setFailed(true)}
        />
      ) : media.kind === "video" ? (
        <Video aria-hidden="true" />
      ) : (
        <ImageIcon aria-hidden="true" />
      )}
      <span className="media-kind">
        {media.kind === "video" ? duration(media.duration) : "照片"}
      </span>
    </div>
  );
}

function TaskItem({
  task,
  onAction,
}: {
  task: Task;
  onAction: (name: "Retry" | "Reveal", id: string) => void;
}) {
  return (
    <div>
      <div className="task-name">{task.media.name}</div>
      <div className="task-meta">
        <span className={task.status === "completed" ? "task-success" : ""}>
          {task.status === "completed" ? "✓ " : ""}
          {labels[task.status] ?? task.status}
        </span>
        <span>
          {task.progress.speed > 0
            ? `${bytes(task.progress.speed)}/s`
            : bytes(task.progress.bytes)}
        </span>
      </div>
      <progress
        value={task.progress.bytes}
        max={Math.max(task.progress.total, 1)}
        aria-label={`${task.media.name} 下载进度`}
      />
      {task.error && task.status === "failed" && (
        <p className="task-error">{task.error}</p>
      )}
      {["paused", "failed"].includes(task.status) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAction("Retry", task.id)}
        >
          <RefreshCw />
          继续下载
        </Button>
      )}
      {task.status === "completed" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAction("Reveal", task.id)}
        >
          <FolderOpen />
          在访达中显示
        </Button>
      )}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<State>(emptyState);
  const [view, setView] = useState<"library" | "history">("library");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanned, setScanned] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [storage, setStorage] = useState(-1);
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const previousPhase = useRef("disconnected");
  const returnFocus = useRef<HTMLElement | null>(null);
  function showConnection() {
    returnFocus.current = document.activeElement as HTMLElement;
    setConnectionOpen(true);
  }
  function showHelp() {
    returnFocus.current = document.activeElement as HTMLElement;
    setHelpOpen(true);
  }
  const connected = state.phase === "connected";
  const connecting = state.phase === "connecting";
  const busy = Boolean(action) || state.busy;
  const completed = state.tasks.filter((t) => t.status === "completed");
  const active = state.tasks.filter((t) => t.status !== "completed");
  const running = active.some(
    (t) => t.status === "downloading" || t.status === "queued",
  );

  useEffect(() => {
    document.title = `映桥 · ${view === "library" ? "相机素材" : "导入记录"}`;
  }, [view]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await call<State>("GetState");
        if (stopped) return;
        setState(next);
        if (
          next.phase === "connected" &&
          previousPhase.current === "connecting"
        ) {
          setConnectionOpen(false);
          setSelection(new Set());
          setFeedback("相机已连接，可以选择素材导入");
        }
        if (
          next.phase === "disconnected" &&
          previousPhase.current === "connected"
        )
          setSelection(new Set());
        previousPhase.current = next.phase;
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      } finally {
        if (!stopped) timer = setTimeout(poll, 600);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  const perform = useCallback(
    async (name: string, fn: () => Promise<unknown>) => {
      setAction(name);
      setError("");
      setFeedback("");
      try {
        return await fn();
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setAction("");
      }
    },
    [],
  );
  const filtered = useMemo(
    () =>
      state.media.filter(
        (m) =>
          (kind === "all" || m.kind === kind) &&
          (storage === -1 || m.storage === storage) &&
          m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [state.media, kind, storage, query],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * 24, currentPage * 24);
  const allSelected =
    visible.length > 0 && visible.every((m) => selection.has(m.id));
  const selectedBytes = state.media
    .filter((m) => selection.has(m.id))
    .reduce((n, m) => n + m.size, 0);
  function toggle(id: string) {
    setSelection((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelection((old) => {
      const next = new Set(old);
      for (const m of visible) {
        if (allSelected) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  }
  async function scan() {
    await perform("scan", async () => {
      setScanned(false);
      setDevices([]);
      const found = await call<Device[] | null>("Scan");
      setDevices(found ?? []);
      setScanned(true);
    });
  }
  async function connect(id: string, manual: boolean) {
    await perform("connect", async () => {
      await call("Connect", id, manual);
      setState((s) => ({
        ...s,
        phase: "connecting",
        busy: true,
        message: "正在连接相机",
      }));
      previousPhase.current = "connecting";
    });
  }
  async function disconnect() {
    await perform("disconnect", async () => {
      await call("Disconnect");
      setSelection(new Set());
      setConnectionOpen(false);
    });
  }
  async function enqueue() {
    await perform("enqueue", async () => {
      await call("Enqueue", [...selection]);
      setFeedback(`已将 ${selection.size} 项素材加入传输队列`);
      setSelection(new Set());
    });
  }
  const taskAction = (name: "Retry" | "Reveal", id: string) => {
    void perform(name, () => call(name, id));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="应用导航">
        <div className="brand">
          <div className="brand-mark">
            <img
              src="/logo-mark.svg"
              width="26"
              height="26"
              alt=""
              aria-hidden="true"
            />
          </div>
          <div>
            <strong>映桥</strong>
            <small>OSMO BRIDGE</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button
            className="nav-button"
            data-active={view === "library"}
            onClick={() => setView("library")}
          >
            <Library />
            相机素材
          </button>
          <button
            className="nav-button"
            data-active={view === "history"}
            onClick={() => setView("history")}
          >
            <History />
            导入记录
            {completed.length > 0 && (
              <span className="nav-count">{completed.length}</span>
            )}
          </button>
        </nav>
        <div>
          <div className="label mb-3">我的相机</div>
          <div className="device-panel">
            <div className="camera-drawing" aria-hidden="true" />
            <div className="device-name">
              {state.deviceName || "Osmo Action 6"}
            </div>
            <div className="connection-state">
              <span className={`dot ${connected ? "connected" : ""}`} />
              {connected
                ? "已连接"
                : connecting
                  ? "连接中"
                  : state.phase === "lost"
                    ? "连接中断"
                    : "等待连接"}
            </div>
            <Button
              className="w-full"
              variant={connected ? "outline" : "default"}
              disabled={busy}
              onClick={() => (connected ? void disconnect() : showConnection())}
            >
              {connected ? <Unplug /> : <Bluetooth />}
              {connected ? "断开连接" : "连接相机"}
            </Button>
            {state.ssid && (
              <p className="text-[10px] muted mt-3 break-all">{state.ssid}</p>
            )}
          </div>
        </div>
        <div className="side-foot">
          <button className="nav-button px-0" onClick={showHelp}>
            <CircleHelp />
            连接帮助
          </button>
          <div className="mt-5">原始素材 · 本地保存</div>
          <div className="mt-1 opacity-80">映桥 0.1.0</div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>
              {view === "library"
                ? "把精彩，带回电脑。"
                : "每一次导入，都有记录。"}
            </h1>
            <p>
              {view === "library"
                ? "无线直连相机，让素材回到你的工作台。"
                : "查看已完成的文件与本地完整性指纹。"}
            </p>
          </div>
          <span className="compatibility">Action 6 · 待实机验证</span>
        </header>
        {state.warning && (
          <div className="notice">
            <Info />
            {state.warning}
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle />
            {error}
            <button
              aria-label="关闭错误提示"
              className="ml-auto shrink-0"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {feedback && (
          <div className="notice" role="status">
            <CheckCircle2 />
            {feedback}
          </div>
        )}
        {state.phase === "lost" && (
          <div className="notice error" role="alert">
            <Wifi />
            {state.message}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              断开并重连
            </Button>
          </div>
        )}
        <div className="work-grid">
          <section
            className="library"
            aria-label={view === "library" ? "相机素材" : "导入记录"}
          >
            <div className="library-header">
              <div>
                <h2>{view === "library" ? "相机素材" : "导入记录"}</h2>
                <p>
                  {view === "library"
                    ? connected
                      ? `${state.media.length} 项素材 · 内置存储与 SD 卡`
                      : "连接后查看相机中的视频和照片"
                    : `已完成 ${completed.length} 项 · 文件保留原始格式`}
                </p>
              </div>
              {view === "library" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!connected || busy}
                  aria-label="刷新素材列表"
                  onClick={() =>
                    void perform("refresh", async () => {
                      await call("Refresh");
                      setSelection(new Set());
                      setPage(1);
                    })
                  }
                >
                  <RefreshCw
                    className={action === "refresh" ? "animate-spin" : ""}
                  />
                  刷新
                </Button>
              )}
            </div>
            {view === "library" && (
              <div className="toolbar">
                <div className="filter-group" aria-label="素材类型">
                  {[
                    ["all", "全部"],
                    ["video", "视频"],
                    ["photo", "照片"],
                  ].map(([v, t]) => (
                    <button
                      key={v}
                      className="filter"
                      aria-pressed={kind === v}
                      onClick={() => {
                        setKind(v);
                        setPage(1);
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="search">
                  <Search aria-hidden="true" />
                  <Input
                    ref={searchRef}
                    aria-label="搜索文件名"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="搜索文件名"
                  />
                  {query && (
                    <button
                      aria-label="清除搜索"
                      onClick={() => {
                        setQuery("");
                        setPage(1);
                        searchRef.current?.focus();
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {view === "library" && connected && (
              <div className="filter-group px-5 pt-4" aria-label="存储位置">
                {[
                  [-1, "所有存储"],
                  [1, "内置存储"],
                  [0, "SD 卡"],
                ].map(([v, t]) => (
                  <button
                    className="filter"
                    key={v}
                    aria-pressed={storage === v}
                    onClick={() => {
                      setStorage(Number(v));
                      setPage(1);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="library-body">
              {view === "history" ? (
                completed.length ? (
                  <table className="history-table">
                    <caption className="sr-only">已完成的素材导入</caption>
                    <thead>
                      <tr>
                        <th>文件</th>
                        <th>大小 / SHA-256</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completed.map((t) => (
                        <tr key={t.id}>
                          <td className="font-mono text-[10px]">
                            {t.media.name}
                          </td>
                          <td>
                            <div>{bytes(t.progress.total)}</div>
                            <details className="text-[10px] muted mt-1">
                              <summary className="cursor-pointer">
                                查看 SHA-256
                              </summary>
                              <code className="break-all">{t.sha256}</code>
                            </details>
                          </td>
                          <td>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => taskAction("Reveal", t.id)}
                            >
                              <FolderOpen />
                              打开
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <History size={38} className="muted mb-5" />
                    <h3>还没有导入记录</h3>
                    <p>素材下载完成后，会在这里留下文件位置和 SHA-256 指纹。</p>
                    <Button
                      variant="outline"
                      onClick={() => setView("library")}
                    >
                      前往相机素材
                      <ArrowRight />
                    </Button>
                  </div>
                )
              ) : !connected ? (
                <div className="empty-state">
                  <div className="connection-art" aria-hidden="true">
                    <span className="device">
                      <Camera />
                    </span>
                    <span className="connection-track">
                      <Wifi />
                    </span>
                    <span className="device">
                      <Laptop />
                    </span>
                  </div>
                  <h3>
                    {connecting ? "正在连接你的相机" : "相机里的精彩，即刻导入"}
                  </h3>
                  <p>
                    {connecting
                      ? state.message
                      : "开启相机，关闭手机上的 DJI Mimo。通过蓝牙配对，建立相机与 Mac 的无线连接。"}
                  </p>
                  <Button
                    disabled={busy && !connecting}
                    onClick={() =>
                      connecting ? void disconnect() : showConnection()
                    }
                  >
                    {connecting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Bluetooth />
                    )}
                    {connecting ? "取消连接" : "连接相机"}
                  </Button>
                  <div className="connect-steps">
                    <span>
                      <b>1</b>开启相机
                    </span>
                    <span>
                      <b>2</b>确认配对
                    </span>
                    <span>
                      <b>3</b>导入素材
                    </span>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <ImageIcon size={38} className="muted mb-5" />
                  <h3>
                    {state.media.length
                      ? "没有匹配的素材"
                      : "相机中暂无可显示的素材"}
                  </h3>
                  <p>
                    {state.media.length
                      ? "尝试其他文件名，或清除当前筛选条件。"
                      : "拍摄后刷新列表，或检查相机中的存储卡。"}
                  </p>
                  {state.media.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setKind("all");
                        setStorage(-1);
                        setPage(1);
                      }}
                    >
                      清除筛选
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="media-grid">
                    {visible.map((m) => (
                      <article
                        key={m.id}
                        className={`media-card ${selection.has(m.id) ? "selected" : ""}`}
                      >
                        <Thumbnail media={m} />
                        <div className="media-check">
                          <Checkbox
                            checked={selection.has(m.id)}
                            aria-label={`选择 ${m.name}`}
                            onCheckedChange={() => toggle(m.id)}
                          />
                        </div>
                        <div className="media-info">
                          <div className="media-name">{m.name}</div>
                          <div className="media-meta">
                            <span>{bytes(m.size)}</span>
                            <span>
                              {m.storage === 1 ? "内置存储" : "SD 卡"}
                            </span>
                          </div>
                          <div className="text-[10px] muted mt-1">
                            {m.date || "拍摄时间未知"}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <nav className="pagination" aria-label="素材分页">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="上一页"
                      disabled={currentPage === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <span>
                      {currentPage} / {totalPages} 页 · {filtered.length} 项
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="下一页"
                      disabled={currentPage === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </nav>
                </>
              )}
            </div>
            {view === "library" && (
              <div className="library-footer">
                <label className="selection-label">
                  <Checkbox
                    checked={allSelected}
                    disabled={!connected || visible.length === 0}
                    onCheckedChange={togglePage}
                    aria-label="选择当前页全部素材"
                  />
                  全选本页
                </label>
                <span className="footer-count">
                  已选 {selection.size} 项
                  {selection.size > 0 ? ` · ${bytes(selectedBytes)}` : ""}
                </span>
                <Button
                  className="download-button"
                  disabled={!connected || !selection.size || busy}
                  onClick={() => void enqueue()}
                >
                  <ArrowDownToLine />
                  {selection.size ? `导入 ${selection.size} 项` : "导入所选"}
                </Button>
              </div>
            )}
          </section>
          <aside className="queue-column" aria-label="传输面板">
            <section className="queue-panel">
              <div className="panel-heading">
                <ArrowDownToLine />
                传输队列<span className="nav-count">{active.length}</span>
                {running && (
                  <Button
                    className="ml-auto"
                    variant="ghost"
                    size="icon"
                    aria-label="暂停所有下载"
                    disabled={Boolean(action)}
                    onClick={() =>
                      void perform("pause", () => call("PauseAll"))
                    }
                  >
                    <Pause />
                  </Button>
                )}
              </div>
              {active.length ? (
                <div className="task-list">
                  {active.map((t) => (
                    <TaskItem key={t.id} task={t} onAction={taskAction} />
                  ))}
                </div>
              ) : (
                <div className="queue-empty">
                  <ArrowDownToLine />
                  <strong>
                    {completed.length
                      ? "素材已安全写入本地"
                      : "等待你的第一份素材"}
                  </strong>
                  <p>
                    选中视频或照片，点击「导入所选」
                    <br />
                    即可开始无线传输
                  </p>
                </div>
              )}
              <div className="destination">
                <div className="label">导入位置</div>
                <div className="destination-path">
                  <Folder />
                  <span>{state.destination}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={Boolean(action)}
                  onClick={() =>
                    void perform("destination", () => call("ChooseDestination"))
                  }
                >
                  <FolderOpen />
                  更改文件夹
                </Button>
              </div>
            </section>
            <div className="small-note">
              <strong>
                <ShieldCheck size={15} className="inline mr-1.5 -mt-0.5" />
                每一帧，保持原样
              </strong>
              下载相机原始文件，不转码。中断后保留进度，完成后记录本地 SHA-256
              指纹。
              <div className="mt-4 pt-4 border-t border-border">
                <Wifi size={14} className="inline mr-1.5" />
                连接相机热点期间，Mac 的 Wi-Fi 互联网连接可能暂时不可用。
              </div>
            </div>
          </aside>
        </div>
        <footer className="statusbar" role="status">
          <span className={`dot ${connected ? "connected" : ""}`} />
          <span>
            {connecting
              ? state.message
              : connected
                ? "相机已连接 · 原始文件传输"
                : "所有素材仅保存在本机"}
          </span>
          <span>仅通过本地网络传输</span>
        </footer>
      </main>
      <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus();
          }}
          className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>连接你的相机</DialogTitle>
            <DialogDescription>
              将相机放在 Mac 附近，并退出手机上的 DJI Mimo。
            </DialogDescription>
          </DialogHeader>
          <div className="connect-box">
            <div className="flex items-center gap-2 font-medium">
              <Bluetooth size={18} />
              蓝牙发现与配对
            </div>
            <p className="text-xs muted mt-2 mb-4">
              首次连接需在相机屏幕确认。配对后，Mac 将切换到相机 Wi-Fi。
            </p>
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void scan()}
            >
              {action === "scan" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Radio />
              )}
              {action === "scan" ? "正在搜索…" : "搜索附近相机"}
            </Button>
            {scanned && !devices.length && (
              <p className="text-xs muted mt-4" role="status">
                未找到相机。请检查蓝牙权限、相机电源，并确认手机已断开。
              </p>
            )}
            <div className="connection-list">
              {devices.map((d) => (
                <button
                  key={d.id}
                  className="camera-option"
                  disabled={busy}
                  onClick={() => void connect(d.id, false)}
                >
                  <Camera size={19} />
                  <span>{d.name}</span>
                  <small>{d.rssi} dBm</small>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-medium text-sm">已经加入相机 Wi-Fi？</div>
            <p className="text-xs muted mt-2 mb-4">
              在 macOS Wi-Fi
              菜单中加入相机热点后，可直接建立素材会话。手动模式的续传仅限当前连接会话。
            </p>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void connect("", true)}
            >
              <Wifi />
              连接已加入的相机热点
            </Button>
          </div>
          {connecting && (
            <div className="notice mt-4" role="status">
              <LoaderCircle className="animate-spin" />
              {state.message}
            </div>
          )}
          {!connecting &&
            state.message !== "连接相机，开始导入原始素材" &&
            !connected && <p className="text-xs muted">{state.message}</p>}
          {error && (
            <div role="alert" className="notice error mt-3">
              {error}
            </div>
          )}
          {connecting && (
            <Button variant="ghost" onClick={() => void disconnect()}>
              取消连接
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>准备好，让相机连上 Mac</DialogTitle>
            <DialogDescription>
              映桥通过蓝牙建立连接，通过相机 Wi-Fi 传输素材。
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal pl-5 space-y-3 text-sm">
            <li>相机开机并停止录像，退出手机 DJI Mimo。</li>
            <li>在 macOS 系统设置中允许映桥使用蓝牙和本地网络。</li>
            <li>点击搜索，选中相机，并在相机屏幕上确认 OSMO 配对。</li>
            <li>
              自动加入热点失败时，通过 macOS Wi-Fi
              菜单手动加入，再使用「连接已加入的相机热点」。
            </li>
          </ol>
          <p className="text-xs muted mt-3">
            首版目标机型为 Action
            6，当前尚未完成实机验证。相机固件更新后可能需要调整兼容性。
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
