/**
 * 格式化工具
 *
 */

/** 相对时间：刚刚 / 5分 / 3小时 / 10月8日 / 2025年10月8日 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);

  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时`;

  const d = new Date(then);
  const n = new Date(now);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (d.getFullYear() === n.getFullYear()) return md;
  return `${d.getFullYear()}年${md}`;
}

/** 详情页精确时间：下午3:24 · 2026年10月11日 */
export function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h24 = d.getHours();
  const period = h24 < 12 ? '上午' : '下午';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${period}${h12}:${mm} · ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 计数缩写：1234 → 1,234；12480 → 1.2万；4200000 → 420万 */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 100_000_000) {
    const w = n / 10_000;
    return `${w < 10 ? w.toFixed(1).replace(/\.0$/, '') : Math.round(w)}万`;
  }
  return `${Math.round(n / 100_000_000)}亿`;
}

/** 视频时长：95 → 1:35 */
export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 可见范围文案 */
export function visibilityLabel(v: string): string {
  switch (v) {
    case 'followers':
      return '仅关注者可见';
    case 'mutual':
      return '仅互关好友可见';
    case 'specified':
      return '指定好友可见';
    case 'private':
      return '仅自己可见';
    default:
      return '公开';
  }
}
