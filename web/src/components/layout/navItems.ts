/**
 * 一级导航定义
 *
 * 左导航（Rail）与窄屏底部 Tab（BottomTabBar）共用同一份数据与选中判定，
 * 避免两处各写一份后逐渐走样。
 */
import { Bell, Bookmark, CircleUserRound, Clapperboard, Hash, Home, Mail } from 'lucide-react';
import { CURRENT_USER } from '@/mocks/currentUser';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  /** 未读角标 */
  badge?: number;
  /** 是否出现在窄屏底部 Tab（底部只放 5 个一级入口） */
  inTabBar?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '首页', icon: Home, inTabBar: true },
  { to: '/videos', label: '视频', icon: Clapperboard, inTabBar: true },
  { to: '/topics', label: '话题', icon: Hash },
  { to: '/notifications', label: '消息', icon: Bell, badge: 3, inTabBar: true },
  { to: '/messages', label: '聊天', icon: Mail, badge: 2, inTabBar: true },
  { to: '/bookmarks', label: '收藏', icon: Bookmark },
  { to: '/me', label: '我', icon: CircleUserRound, inTabBar: true },
];

/** 底部 Tab 用的一级入口 */
export const TABBAR_ITEMS = NAV_ITEMS.filter((i) => i.inTabBar);

/**
 * 选中判定
 *
 * 「我」指向 /me，进来后会立刻重定向到 /u/<自己>，重定向后 URL 不再等于 to，
 * NavLink 自带匹配会因此丢高亮，所以这里显式按 pathname 判定。
 */
export function isActivePath(to: string, pathname: string): boolean {
  const self = CURRENT_USER.handle;

  if (to === '/') return pathname === '/';
  if (to === '/me') return pathname === '/me' || pathname === `/u/${self}`;
  /* 「话题」的落点是列表页 /topics，但讨论页是 /topic/<名>（单数），
     靠 NavLink 的前缀匹配接不上，这里显式认领这一族。 */
  if (to === '/topics') return pathname === '/topics' || pathname.startsWith('/topic/');

  return pathname === to || pathname.startsWith(`${to}/`);
}
