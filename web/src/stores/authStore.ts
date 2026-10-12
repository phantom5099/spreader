/**
 * 登录态（Demo）
 */
import { create } from 'zustand';

const AUTH_KEY = 'spreader.auth.v1';

function readAuth(): boolean {
  try {
    /* 默认 true：Demo 首次打开应当直接是已登录状态，否则会先撞登录页 */
    const raw = localStorage.getItem(AUTH_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function writeAuth(v: boolean): void {
  try {
    localStorage.setItem(AUTH_KEY, v ? '1' : '0');
  } catch {
    /* 隐私模式下静默失败 */
  }
}

interface AuthState {
  /** 是否已登录 */
  authed: boolean;
  /** 登录成功（登录页调用） */
  signIn: () => void;
  /** 退出登录 */
  signOut: () => void;
  /** 供非 hook 场景读取 */
  isAuthed: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  authed: readAuth(),

  signIn: () => {
    writeAuth(true);
    set({ authed: true });
  },

  signOut: () => {
    writeAuth(false);
    set({ authed: false });
  },

  isAuthed: () => get().authed,
}));
