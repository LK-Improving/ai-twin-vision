/**
 * 通用格式化工具
 */

/** 格式化 ISO 时间为 YYYY-MM-DD HH:mm */
export function formatDateTime(input?: string | null): string {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** 仅日期 */
export function formatDate(input?: string | null): string {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 相对时间（刚刚 / x分钟前） */
export function fromNow(input?: string | null): string {
  if (!input) return '-';
  const d = new Date(input).getTime();
  if (Number.isNaN(d)) return '-';
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  return `${day} 天前`;
}

/** 文件大小可读化 */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 截断长文本 */
export function truncate(text: string, max = 24): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
