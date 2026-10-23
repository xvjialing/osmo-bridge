import { mkdir, copyFile, writeFile } from "node:fs/promises";
const target = new URL("../.cache/frontend-qa/__qa_media__/", import.meta.url);
await mkdir(target, { recursive: true });
// 仅供显式 QA 构建使用，素材为生成的测试图案，不是真实相机照片或视频。
await copyFile(
  new URL("../frontend/fixtures/preview-video.mp4", import.meta.url),
  new URL("video.mp4", target),
);
await writeFile(
  new URL("photo.svg", target),
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#dbe7ff"/><rect x="60" y="60" width="840" height="420" rx="16" fill="#245bdb"/><text x="480" y="260" text-anchor="middle" fill="white" font-size="40">照片预览测试</text><text x="480" y="320" text-anchor="middle" fill="white" font-size="22">虚拟素材 · 不代表相机实拍</text></svg>`,
);
