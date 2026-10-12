/**
 * 外观设置状态（主题 + 字号）
 */
import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
export type FontScaleIndex = 0 | 1 | 2 | 3;

export const FONT_SCALES = [0.875, 1, 1.125, 1.25] as const;
export const FONT_LABELS = ['小', '标准', '大', '特大'] as const;

const THEME_KEY = 'spreader.theme.v1';
const FONT_KEY = 'spreader.fontScale.v1';

interface AppearanceState {
  theme: ThemeMode;
  /** 当前实际生效的是否为暗色（跟随系统时由媒体查询决定） */
  resolvedDark: boolean;
  fontScale: FontScaleIndex;

  setTheme: (mode: ThemeMode) => void;
  setFontScale: (index: FontScaleIndex) => void;
  /** 跟随系统模式下，系统主题变化时重新解析 */
  syncSystem: () => void;
}

function readTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function readFontScale(): FontScaleIndex {
  const v = Number(localStorage.getItem(FONT_KEY));
  return v === 0 || v === 1 || v === 2 || v === 3 ? (v as FontScaleIndex) : 1;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveDark(mode: ThemeMode): boolean {
  return mode === 'system' ? systemPrefersDark() : mode === 'dark';
}

/** 把主题写到 <html data-theme>，字号写到 <html style="--font-scale"> */
function applyToDom(mode: ThemeMode, fontIndex: FontScaleIndex) {
  const root = document.documentElement;
  const dark = resolveDark(mode);

  if (dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');

  root.style.setProperty('--font-scale', String(FONT_SCALES[fontIndex]));
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  theme: readTheme(),
  resolvedDark: resolveDark(readTheme()),
  fontScale: readFontScale(),

  setTheme: (mode) => {
    localStorage.setItem(THEME_KEY, mode);
    applyToDom(mode, useAppearanceStore.getState().fontScale);
    set({ theme: mode, resolvedDark: resolveDark(mode) });
  },

  setFontScale: (index) => {
    localStorage.setItem(FONT_KEY, String(index));
    applyToDom(useAppearanceStore.getState().theme, index);
    set({ fontScale: index });
  },

  syncSystem: () =>
    set((s) => ({ resolvedDark: resolveDark(s.theme) })),
}));

/**
 * 初始化：挂系统主题监听。
 * 与应用启动时保持一致 —— 首帧由 index.html 的内联脚本处理，
 * 这里只接管后续变化。
 */
export function initAppearance() {
  const { theme, fontScale } = useAppearanceStore.getState();
  applyToDom(theme, fontScale);

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const state = useAppearanceStore.getState();
    if (state.theme !== 'system') return;
    applyToDom('system', state.fontScale);
    state.syncSystem();
  };

  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
