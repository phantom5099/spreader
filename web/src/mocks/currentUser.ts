/**
 * 当前登录用户（Demo 用 mock）
 * 登录组放到最后做，Demo 阶段默认已登录。
 */
import type { Author } from '@/types/feed';
import { avatarDataUri } from './placeholders';

export const CURRENT_USER: Author & { bio: string; following: number; followers: number } = {
  user_id: 'u_10001',
  nickname: '林知夏',
  handle: 'zhixia',
  avatar_url: avatarDataUri('u_10001_current', '林'),
  bio: '做点小东西。喜欢把复杂的事说简单。',
  following: 128,
  followers: 12480,
};

export const CURRENT_USER_CONTACTS = {
  phone: '138****6621',
  email: 'zhixia@example.com',
  backupEmail: 'zhixia.backup@example.com',
};
