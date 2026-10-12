/**
 * 搜索历史状态（zustand）
 */
import { create } from 'zustand';
import {
  clearSearchHistory,
  fetchSearchHistory,
  pushSearchHistory,
  removeSearchHistory,
} from '@/mocks/api';
import { readSearchHistory } from '@/mocks/searchHistory';

const MAX_HISTORY = 10;

interface SearchHistoryState {
  items: string[];

  refresh: () => Promise<void>;
  /** 记录一次搜索（去重、置顶、限长） */
  push: (keyword: string) => void;
  /** 删除单条 */
  remove: (keyword: string) => void;
  /** 全部清除 */
  clear: () => void;
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  items: readSearchHistory(),

  refresh: async () => {
    const items = await fetchSearchHistory();
    set({ items });
  },

  push: (keyword) => {
    set({ items: [keyword, ...get().items.filter((x) => x !== keyword)].slice(0, MAX_HISTORY) });
    void pushSearchHistory(keyword, MAX_HISTORY).then((items) => set({ items }));
  },

  remove: (keyword) => {
    set({ items: get().items.filter((x) => x !== keyword) });
    void removeSearchHistory(keyword).then((items) => set({ items }));
  },

  clear: () => {
    set({ items: [] });
    void clearSearchHistory();
  },
}));
