import { emptyState, type State, type Method, type Task } from "./bridge";

// 仅由 test 构建加载；数据和动作都是显式标记的本地测试夹具。
const scenario = new URLSearchParams(location.search).get("fixture");
const state: State = {
  ...emptyState,
  warning: "本地测试夹具 · 虚拟相机，不会连接设备或写入素材",
  destination: "/测试目录/映桥",
  media: [],
  tasks: [],
};
if (scenario !== "disconnected" && scenario !== "error") {
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
export async function fixtureCall(method: Method, args: unknown[]) {
  if (method === "GetState") return structuredClone(state);
  if (method === "Scan") {
    await new Promise((r) => setTimeout(r, 250));
    if (scenario === "error")
      throw new Error("测试错误：蓝牙权限未开启，请在系统设置中允许访问");
    return [{ id: "test-camera", name: "Action 6 · 虚拟设备", rssi: -42 }];
  }
  if (method === "Connect") {
    state.phase = "connecting";
    state.busy = true;
    state.message = "测试：等待相机确认";
    setTimeout(() => {
      state.phase = "disconnected";
      state.busy = false;
      state.message = "测试错误：相机未响应，可重试连接";
    }, 700);
    return;
  }
  if (method === "Disconnect") {
    state.phase = "disconnected";
    state.media = [];
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
