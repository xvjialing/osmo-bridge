import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowDownToLine, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  errorMessage,
  mediaSource,
  type Media,
} from "@/lib/bridge";

function PreviewContent({ media }: { media: Media }) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [original, setOriginal] = useState(false);
  const [readySource, setReadySource] = useState("");
  const [failureReason, setFailureReason] = useState("");
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setFailed(true);
      setFailureReason("读取预览超时，请检查相机连接后重试。");
    }, 30000);
    return () => clearTimeout(timer);
  }, [loading, attempt, original]);
  const raw = /\.dng$/i.test(media.name);
  const source =
    mediaSource(media, raw ? "thumbnail" : "preview") +
    `?retry=${attempt}&original=${original ? "1" : "0"}`;
  useEffect(() => {
    const controller = new AbortController();
    setReadySource("");
    setFailed(false);
    setLoading(true);
    setFailureReason("");
    void fetch(source, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setFailureReason(
            response.status === 404
              ? "相机未找到此文件（HTTP 404），请刷新素材列表后重试。"
              : `相机文件读取失败（HTTP ${response.status}），请检查连接后重试。`,
          );
          setFailed(true);
          setLoading(false);
          return;
        }
        setReadySource(source);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailureReason("无法读取相机文件，请检查热点连接后重试。");
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [source]);
  const loaded = () => setLoading(false);
  const fail = () => {
    setLoading(false);
    setFailed(true);
    setFailureReason(
      "文件已响应，但播放或图片解码失败。可切换预览模式，或导入原文件后用本机应用查看。",
    );
  };
  return (
    <>
      <div className="preview-stage" aria-busy={loading && !failed}>
        {!failed &&
          readySource === source &&
          (media.kind === "video" ? (
            <video
              key={source}
              src={source}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={loaded}
              onError={fail}
              aria-label={`播放 ${media.name}`}
            />
          ) : (
            <img
              key={source}
              src={source}
              alt={media.name}
              onLoad={loaded}
              onError={fail}
            />
          ))}
        {loading && !failed && (
          <p className="preview-loading" role="status">
            <LoaderCircle className="animate-spin" />
            正在读取预览…
          </p>
        )}
        {failed && (
          <div className="preview-error" role="alert">
            <p>暂时无法预览此素材</p>
            <p>{failureReason}</p>
            <Button
              variant="outline"
              onClick={() => {
                setFailed(false);
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            >
              <RefreshCw />
              重新加载
            </Button>
          </div>
        )}
      </div>
      <div className="preview-footer">
        <div className="text-xs muted">
          <p>
            {bytes(media.size)} · {media.storage === 1 ? "内置存储" : "SD 卡"} ·{" "}
            {media.date || "拍摄时间未知"}
          </p>
          <p>
            {raw
              ? "DNG 显示相机缩略预览；查看原始画质请先导入。"
              : media.kind === "video"
                ? original
                  ? "正在预览原视频；D-Log M 为平坦色彩，显示可能偏灰。"
                  : "优先读取相机低分辨率预览，不存在时读取原视频；导入始终保存原文件。"
                : "直接从相机读取原照片。"}
          </p>
        </div>
        {media.kind === "video" && (
          <Button
            variant="outline"
            onClick={() => setOriginal((value) => !value)}
          >
            {original ? "使用流畅预览" : "查看原视频"}
          </Button>
        )}
        <Button
          disabled={importing}
          onClick={async () => {
            setImporting(true);
            setNotice("");
            try {
              await call("Enqueue", [media.id]);
              setNotice("已加入导入队列，可在传输面板查看进度。");
            } catch (e) {
              setNotice(errorMessage(e));
            } finally {
              setImporting(false);
            }
          }}
        >
          {importing ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ArrowDownToLine />
          )}
          导入原文件
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </>
  );
}

export function MediaPreview({
  media,
  onClose,
  returnFocus,
}: {
  media: Media | null;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={Boolean(media)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={content}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          content.current?.focus();
        }}
        className="media-preview-dialog"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="preview-title">
            {media?.name || "素材预览"}
          </DialogTitle>
          <DialogDescription>
            {media?.kind === "video"
              ? "视频预览 · 可播放、暂停和拖动进度"
              : "照片预览"}
          </DialogDescription>
        </DialogHeader>
        {media && <PreviewContent key={media.id} media={media} />}
      </DialogContent>
    </Dialog>
  );
}
