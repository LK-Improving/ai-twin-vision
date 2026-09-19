/**
 * 组件库 → 画布的拖拽负载编解码（HTML5 dataTransfer）。
 * MIME 类型是前后端约定，改动会破坏已发布场景中的自定义拖放，故单点定义。
 */
import type { LibraryDragPayload } from './types';

export const DRAG_MIME = 'application/x-dt-widget';

/** 序列化拖拽负载 */
export function encodeDragPayload(payload: LibraryDragPayload): string {
  return JSON.stringify(payload);
}

/** dataTransfer 的最小结构化声明，避免绑定 DOM 类型便于测试 */
interface WithDataTransfer {
  dataTransfer?: { getData(format: string): string } | null;
}

/**
 * 从 drag 事件里解析负载；非本平台的负载或 JSON 损坏一律返回 null，
 * 这样浏览器自带的文件拖放（如拖入 glb）不会被误判。
 */
export function parseDragPayload(e: WithDataTransfer): LibraryDragPayload | null {
  const raw = e.dataTransfer?.getData(DRAG_MIME) || e.dataTransfer?.getData('text/plain') || '';
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as LibraryDragPayload;
    return obj && obj.source === 'library' ? obj : null;
  } catch {
    return null;
  }
}
