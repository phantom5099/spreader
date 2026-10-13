/**
 * 播放偏好（zustand）
 *
 * 循环播放 / 自动播放属于「本机偏好」，读写都走数据访问层（@/mocks/api），
 * 真实后端接入时换成设置接口，本文件与组件层都不用改。
 */
import { create } from 'zustand';
import type { PlaybackPrefs } from '@/mocks/settings';
import { readPlaybackPrefs } from '@/mocks/settings';
import { fetchPlaybackPrefs, updatePlaybackPrefsApi } from '@/mocks/api';

interface PreferencesState extends PlaybackPrefs {
  /** 是否已从"服务端"拉过一次 */
  loaded: boolean;
  load: () => Promise<void>;
  setVideoLoop: (value: boolean) => void;
  setAutoplay: (value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  /* 初值同步取本地缓存，避免首屏出现"默认值 → 真实值"的跳变 */
  ...readPlaybackPrefs(),
  loaded: false,

  load: async () => {
    const prefs = await fetchPlaybackPrefs();
    set({ ...prefs, loaded: true });
  },

  setVideoLoop: (value) => {
    const prev = get().video_loop;
    set({ video_loop: value });
    void updatePlaybackPrefsApi({ video_loop: value }).catch(() => {
      /* 落库失败：回滚 */
      set({ video_loop: prev });
    });
  },

  setAutoplay: (value) => {
    const prev = get().autoplay;
    set({ autoplay: value });
    void updatePlaybackPrefsApi({ autoplay: value }).catch(() => set({ autoplay: prev }));
  },
}));
