import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchField } from "@/components/search-field";
import {
  bytes,
  call,
  errorMessage,
  type LogInfo,
  type LogPage,
  type LogEntry,
  type CleanupResult,
} from "@/lib/bridge";

const levelNames: Record<string, string> = {
  debug: "详细",
  info: "信息",
  warn: "警告",
  error: "错误",
};
const componentNames: Record<string, string> = {
  app: "应用",
  connection: "连接",
  bluetooth: "蓝牙",
  wifi: "Wi-Fi",
  datalink: "数据链路",
  media: "素材",
  transfer: "传输",
  framework: "运行框架",
};
const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function SettingsPage({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [info, setInfo] = useState<LogInfo | null>(null);
  const [days, setDays] = useState("7");
  const [detailed, setDetailed] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState("");
  const [confirmation, setConfirmation] = useState<"shorten" | "clear" | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [level, setLevel] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [exported, setExported] = useState("");
  const generation = useRef(0);
  const alive = useRef(true);
  const daysInput = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dirty =
    Boolean(info) &&
    (days !== String(info!.settings.retentionDays) ||
      detailed !== (info!.settings.level === "debug"));
  const busy = Boolean(action);

  useEffect(() => {
    alive.current = true;
    let active = true;
    void call<LogInfo>("GetLogInfo")
      .then((v) => {
        if (active) {
          setInfo(v);
          setDays(String(v.settings.retentionDays));
          setDetailed(v.settings.level === "debug");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const fetchInfo = useCallback(async (reset = false) => {
    const v = await call<LogInfo>("GetLogInfo");
    if (alive.current) {
      setInfo(v);
      if (reset) {
        setDays(String(v.settings.retentionDays));
        setDetailed(v.settings.level === "debug");
      }
    }
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    if (composing) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setReadError("");
    const timer = setTimeout(
      () => {
        void call<LogPage>("ReadLogs", {
          level,
          search,
          before: "",
          limit: 100,
        })
          .then((v) => {
            if (request !== generation.current || !alive.current) return;
            setEntries(v.entries ?? []);
            setCursor(v.nextCursor);
            setHasMore(v.hasMore);
            setSkipped(v.skipped);
          })
          .catch((e) => {
            if (request === generation.current && alive.current)
              setReadError(errorMessage(e));
          })
          .finally(() => {
            if (request === generation.current && alive.current)
              setLoading(false);
          });
      },
      search ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [level, search, composing, refresh]);

  async function more() {
    const request = ++generation.current;
    setLoading(true);
    setReadError("");
    try {
      const v = await call<LogPage>("ReadLogs", {
        level,
        search,
        before: cursor,
        limit: 100,
      });
      if (request !== generation.current || !alive.current) return;
      setEntries((previous) => {
        const ids = new Set(previous.map((e) => e.id));
        return [
          ...previous,
          ...(v.entries ?? []).filter((e) => !ids.has(e.id)),
        ];
      });
      setCursor(v.nextCursor);
      setHasMore(v.hasMore);
      setSkipped(v.skipped);
    } catch (e) {
      if (request === generation.current) setReadError(errorMessage(e));
    } finally {
      if (request === generation.current && alive.current) setLoading(false);
    }
  }
  async function run(name: string, fn: () => Promise<void>) {
    if (busy) return;
    setAction(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setAction("");
    }
  }
  async function save() {
    await run("save", async () => {
      await call("SaveLogSettings", {
        retentionDays: Number(days),
        level: detailed ? "debug" : "info",
      });
      await fetchInfo(true);
      setConfirmation(null);
      setNotice("日志设置已保存，即刻生效");
      setRefresh((v) => v + 1);
    });
  }
  function submit() {
    const count = Number(days);
    if (!Number.isInteger(count) || count < 1 || count > 90) {
      setFieldError("请输入 1 到 90 之间的整数");
      daysInput.current?.focus();
      return;
    }
    setFieldError("");
    if (info && count < info.settings.retentionDays) {
      returnFocus.current = document.activeElement as HTMLElement;
      setConfirmation("shorten");
    } else void save();
  }
  async function clean(all: boolean) {
    await run(all ? "clear" : "expired", async () => {
      generation.current++;
      setLoading(false);
      const result = await call<CleanupResult>("CleanLogs", all);
      setEntries([]);
      await fetchInfo();
      setConfirmation(null);
      setNotice(
        `已清理 ${result.files} 个日志文件，释放 ${bytes(result.bytes)}`,
      );
      setRefresh((v) => v + 1);
    });
  }
  async function exportLogs() {
    await run("export", async () => {
      const file = await call<string>("ExportLogs");
      if (file) {
        setExported(file);
        setNotice("诊断包已保存，可在恢复联网后自行分享排查");
        await fetchInfo();
        setRefresh((v) => v + 1);
      }
    });
  }
  const visibleError = error || info?.lastError;

  return (
    <div className="settings-page">
      <div className="settings-intro">
        <span className="settings-intro-icon">
          <ShieldCheck />
        </span>
        <div>
          <strong>断开公网，诊断记录依然在。</strong>
          <p>
            相机热点连接期间持续写入本机；重新联网后，可回看日志或导出诊断包。
          </p>
        </div>
        <span className="settings-local-tag">仅本地保存</span>
      </div>
      {visibleError && (
        <div className="notice error" role="alert">
          <AlertCircle />
          {visibleError}
          {!info && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run("reload", () => fetchInfo(true))}
            >
              重新读取
            </Button>
          )}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <CheckCircle2 />
          {notice}
        </div>
      )}
      <section className="settings-card" aria-labelledby="log-policy-title">
        <div className="settings-card-heading">
          <div>
            <h2 id="log-policy-title">日志记录</h2>
            <p>按需保留，自动清理，连接过程可追溯。</p>
          </div>
          <span className="log-status">
            <span className="dot connected" />
            默认开启
          </span>
        </div>
        <div className="settings-policy-grid">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="log-policy-form"
          >
            <label htmlFor="log-retention" className="settings-field-label">
              保留天数
            </label>
            <div className="retention-control">
              <Input
                id="log-retention"
                ref={daysInput}
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                step={1}
                value={days}
                disabled={!info || busy}
                aria-invalid={Boolean(fieldError)}
                aria-describedby="retention-help retention-error"
                onChange={(e) => {
                  setDays(e.target.value);
                  setFieldError("");
                }}
              />
              <span>天</span>
              <div className="retention-presets">
                {[7, 14, 30].map((n) => (
                  <button
                    type="button"
                    key={n}
                    disabled={!info || busy}
                    aria-pressed={days === String(n)}
                    onClick={() => {
                      setDays(String(n));
                      setFieldError("");
                    }}
                  >
                    {n} 天
                  </button>
                ))}
              </div>
            </div>
            <p id="retention-help" className="settings-hint">
              可设置 1–90 天，包含今天。缩短保留期限时会清理过期日志。
            </p>
            <p id="retention-error" className="field-error">
              {fieldError}
            </p>
            <label className="detail-log-option">
              <Checkbox
                checked={detailed}
                disabled={!info || busy}
                onCheckedChange={(v) => setDetailed(v === true)}
                aria-describedby="detailed-help"
              />
              <span>
                <strong>记录详细日志</strong>
                <span id="detailed-help">
                  增加握手、分页和重试参数，适合复现连接问题时开启。
                </span>
              </span>
            </label>
            <div className="settings-save">
              <Button
                type="submit"
                disabled={!info || busy || !dirty}
                aria-busy={action === "save"}
              >
                {action === "save" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CheckCircle2 />
                )}
                保存设置
              </Button>
              <span>
                {!info
                  ? "正在读取日志设置"
                  : dirty
                    ? "有未保存的修改"
                    : "设置已同步到本机"}
              </span>
            </div>
          </form>
          <div className="log-storage">
            <div className="log-storage-heading">
              <HardDrive size={17} />
              <span>本地日志占用</span>
            </div>
            <div className="log-storage-size">
              {info ? bytes(info.bytes) : "—"}
              <small>/ {bytes(info?.maxBytes ?? 104857600)}</small>
            </div>
            <progress
              aria-label="本地日志容量使用"
              value={info?.bytes ?? 0}
              max={info?.maxBytes ?? 104857600}
            />
            <p className="settings-hint">
              {info?.files ?? 0} 个文件 · 按天分文件，单文件最多 5 MB
              <br />
              达到容量上限时，优先清理最旧的日志。
            </p>
            <div className="log-directory">
              <FolderOpen size={15} />
              <code>{info?.directory ?? "正在读取日志目录…"}</code>
            </div>
            <div className="settings-storage-actions">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!info || busy}
                onClick={() =>
                  void run("folder", async () => {
                    await call("OpenLogDirectory");
                  })
                }
              >
                <FolderOpen />
                打开日志文件夹
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!info || busy}
                onClick={() => void clean(false)}
              >
                清理过期日志
              </Button>
            </div>
          </div>
        </div>
        <div className="settings-privacy">
          <Info size={15} />
          <span>
            不记录密码、配对标识、原始报文或素材内容。已知 Wi-Fi
            名称、设备标识、本地路径和 URL 参数会脱敏。
          </span>
        </div>
      </section>
      <section className="settings-card" aria-labelledby="log-viewer-title">
        <div className="settings-card-heading">
          <div>
            <h2 id="log-viewer-title">日志查看</h2>
            <p>按最新优先排列 · 每次读取 100 条 · 不受相机连接状态影响</p>
          </div>
          <div className="log-viewer-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || loading}
              onClick={() =>
                void run("refresh", async () => {
                  await fetchInfo();
                  setRefresh((v) => v + 1);
                })
              }
            >
              <RefreshCw
                className={action === "refresh" ? "animate-spin" : ""}
              />
              刷新日志
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!info || busy}
              onClick={() => void exportLogs()}
              aria-busy={action === "export"}
            >
              {action === "export" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
              导出诊断包
            </Button>
          </div>
        </div>
        <div className="log-toolbar">
          <div className="filter-group" aria-label="日志级别">
            {[
              ["all", "全部"],
              ["error", "错误"],
              ["warn", "警告"],
              ["info", "信息"],
              ["debug", "详细"],
            ].map(([v, label]) => (
              <button
                type="button"
                key={v}
                className="filter"
                aria-pressed={level === v}
                disabled={busy}
                onClick={() => setLevel(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchField
            value={search}
            label="日志搜索"
            placeholder="搜索事件、连接编号或错误"
            disabled={busy}
            onValueChange={setSearch}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
          />
        </div>
        <div className="log-read-status" role="status">
          {loading ? (
            <>
              <LoaderCircle size={14} className="animate-spin" />
              正在读取本地日志…
            </>
          ) : (
            <>
              已显示 {entries.length} 条{hasMore ? " · 还有更早记录" : ""}
              {skipped > 0
                ? ` · 已跳过 ${skipped} 条不完整记录，可刷新重试`
                : ""}
            </>
          )}
        </div>
        {readError && (
          <div className="notice error mx-5" role="alert">
            <AlertCircle />
            {readError}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefresh((v) => v + 1)}
            >
              重试读取
            </Button>
          </div>
        )}
        <div className="log-table-scroll" aria-busy={loading}>
          {entries.length ? (
            <table className="log-table">
              <caption className="sr-only">
                本地诊断事件，时间按当前电脑时区显示
              </caption>
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">级别</th>
                  <th scope="col">来源</th>
                  <th scope="col">事件与详情</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <time dateTime={e.time}>
                        {Number.isNaN(Date.parse(e.time))
                          ? e.time
                          : timeFormat.format(new Date(e.time))}
                      </time>
                    </td>
                    <td>
                      <span className={`log-level log-level-${e.level}`}>
                        {levelNames[e.level] ?? e.level}
                      </span>
                    </td>
                    <td className="log-component">
                      {componentNames[e.component] ?? e.component}
                    </td>
                    <td>
                      <div className="log-message">{e.message}</div>
                      <details>
                        <summary>
                          <code>{e.event}</code>
                          <span>展开详情</span>
                        </summary>
                        <dl className="log-fields">
                          <div>
                            <dt>运行会话</dt>
                            <dd>{e.session}</dd>
                          </div>
                          {Object.entries(e.fields ?? {}).map(
                            ([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value}</dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !loading && !readError ? (
            <div className="log-empty">
              <FileText size={32} />
              <strong>
                {search || level !== "all" ? "没有匹配的日志" : "暂无日志记录"}
              </strong>
              <p>
                {search || level !== "all"
                  ? "尝试其他关键词或清除级别筛选。"
                  : "后续连接与传输事件会自动记录在这里。"}
              </p>
              {(search || level !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setLevel("all");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </div>
          ) : (
            <div className="log-empty">
              <FileText size={32} />
              <p>本地日志会显示在这里</p>
            </div>
          )}
        </div>
        <div className="log-viewer-footer">
          <span>导出包含保留期内全部日志，不受当前筛选影响。</span>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={() => void more()}
            >
              加载更早日志
            </Button>
          )}
        </div>
        {exported && (
          <div className="log-exported" role="status">
            <CheckCircle2 size={16} />
            <span>
              已保存：<code>{exported}</code>
            </span>
          </div>
        )}
      </section>
      <section className="log-cleanup">
        <div>
          <strong>清理全部日志</strong>
          <p>
            只删除应用诊断日志，不影响素材、下载队列和导入记录。后续日志会继续记录。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="text-destructive"
          disabled={!info || busy}
          onClick={() => {
            returnFocus.current = document.activeElement as HTMLElement;
            setError("");
            setConfirmation("clear");
          }}
        >
          <Trash2 />
          清理全部日志
        </Button>
      </section>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirmation(null);
        }}
      >
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelButton.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {confirmation === "clear"
                ? "清理全部应用日志？"
                : `将日志保留时间缩短为 ${days} 天？`}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "clear"
                ? `将删除当前约 ${info?.files ?? 0} 个日志文件（${bytes(info?.bytes ?? 0)}），删除后无法恢复。建议先导出需要排查的记录。`
                : `保存后会立即清理超过 ${days} 个自然日的日志，包含今天。已清理的日志无法恢复。`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm muted">
            照片、视频、下载队列及导入记录不会被删除。
          </p>
          {error && (
            <div className="notice error" role="alert">
              <AlertCircle />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              ref={cancelButton}
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              取消
            </Button>
            <Button
              variant={confirmation === "clear" ? "destructive" : "default"}
              disabled={busy}
              onClick={() =>
                void (confirmation === "clear" ? clean(true) : save())
              }
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {confirmation === "clear" ? "确认清理日志" : "保存并清理过期日志"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
