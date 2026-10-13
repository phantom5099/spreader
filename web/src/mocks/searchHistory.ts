/**
 * 搜索历史数据源（Demo）
 *
 * 和草稿一样属于「账号级可写数据」：界面侧通过 mocks/api.ts 的异步接口读写，
 * 本文件只负责存取，接入真实后端时连同 api.ts 里的三个接口一起替换。
 */
const STORAGE_KEY = 'spreader.searchHistory.v1';

/** 预置几条最近搜索，让搜索页首次进入就有内容可展示 */
const SEED_HISTORY = ['摄影构图', '远程办公', '手冲咖啡', '深夜emo'];

/** 读取搜索历史；首次进入时写入预置数据 */
export function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      writeSearchHistory(SEED_HISTORY);
      return SEED_HISTORY;
    }
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSearchHistory(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式 / 配额满：静默失败，不阻塞搜索 */
  }
}
