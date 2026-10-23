import { useState } from "react";
import { Image as ImageIcon, Video } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { bytes, duration, mediaSource, type Media } from "@/lib/bridge";

function Thumbnail({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="media-visual">
      {media.thumb && !failed ? (
        <img
          loading="lazy"
          alt=""
          src={mediaSource(media, "thumbnail")}
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

export function MediaCard({
  media: m,
  selected,
  thumbnailRevision,
  onPreview,
  onToggle,
}: {
  media: Media;
  selected: boolean;
  thumbnailRevision: number;
  onPreview: (id: string, trigger: HTMLElement) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <article className={`media-card ${selected ? "selected" : ""}`}>
      <button
        className="media-preview-trigger"
        aria-label={`预览 ${m.name}`}
        onClick={(e) => onPreview(m.id, e.currentTarget)}
      >
        <Thumbnail key={`${m.id}-${thumbnailRevision}`} media={m} />
      </button>
      <div className="media-check">
        <Checkbox
          checked={selected}
          aria-label={`选择 ${m.name}`}
          onCheckedChange={() => onToggle(m.id)}
        />
      </div>
      <div className="media-info">
        <button
          className="media-name media-name-button"
          title={m.name}
          onClick={(e) => onPreview(m.id, e.currentTarget)}
        >
          <span>{m.name}</span>
        </button>
        <div className="media-meta">
          <span>{bytes(m.size)}</span>
          <span>{m.storage === 1 ? "内置存储" : "SD 卡"}</span>
        </div>
        <div className="media-date">{m.date || "拍摄时间未知"}</div>
      </div>
    </article>
  );
}
