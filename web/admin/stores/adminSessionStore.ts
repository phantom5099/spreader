/**
 * 管理端登录态
 *
 * 与用户端 authStore 完全隔离：
 * - 存储 key 不同（spreader.admin.session.v1）
 * - 持久化用 sessionStorage（管理后台按“一次浏览器会话”理解，
 *   关闭标签页即失效；真实环境由服务端令牌过期时间决定）
 *
 * 接真实后端时：登录/登出/恢复都会走 `/v1/admin/auth/*`，
 * 这里只保存服务端返回的管理员信息与令牌获取方式。
 */

import { create } from 'zustand';
import type { AdminAccount, SignInResult } from '@admin/types';
import {
  ADMIN_SESSION_KEY,
  fetchCurrentAdmin,
  signIn as apiSignIn,
  signOut as apiSignOut,
} from '@admin/mocks/adminApi';

function readSession(): AdminAccount | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AdminAccount) : null;
  } catch {
    return null;
  }
}

function writeSession(admin: AdminAccount | null): void {
  try {
    if (admin) sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
    else sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    /* 隐私模式下静默失败 */
  }
}

interface AdminSessionState {
  admin: AdminAccount | null;
  /** 启动后是否已完成登录态校验（避免刷新时守卫误跳登录页） */
  ready: boolean;
  signIn: (account: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** 刷新后用服务端会话恢复登录态 */
  restore: () => Promise<void>;
}

export const useAdminSessionStore = create<AdminSessionState>((set) => ({
  admin: null,
  ready: false,

  signIn: async (account, password) => {
    const result = await apiSignIn(account, password);
    if (result.ok && result.admin) {
      writeSession(result.admin);
      set({ admin: result.admin, ready: true });
    }
    return result;
  },

  signOut: async () => {
    await apiSignOut();
    writeSession(null);
    set({ admin: null });
  },

  restore: async () => {
    const cached = readSession();
    if (!cached) {
      set({ admin: null, ready: true });
      return;
    }
    /* 有缓存再问一次服务端；服务端不认则清除（真实环境此处校验令牌） */
    const fresh = await fetchCurrentAdmin();
    if (fresh && fresh.admin_id === cached.admin_id) {
      set({ admin: fresh, ready: true });
    } else {
      writeSession(null);
      set({ admin: null, ready: true });
    }
  },
}));

/** 非 hook 场景读取当前管理员 */
export function currentAdminAccount(): AdminAccount | null {
  return useAdminSessionStore.getState().admin;
}
