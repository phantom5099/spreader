import { useNavigate } from 'react-router-dom';
import {
  UserRound,
  SlidersHorizontal,
  Bell,
  Monitor,
  ShieldCheck,
  Link2,
  Ban,
  BellOff,
  FileText,
  Info,
  LogOut,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsGroup, SettingsRow, SettingsValue } from '@/components/settings/SettingsRow';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useState } from 'react';
import { toast } from '@/stores/toastStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useAuthStore } from '@/stores/authStore';
import { CURRENT_USER } from '@/mocks/currentUser';
import { MY_BLOCKED, MY_MUTED, MY_TOPICS } from '@/mocks/users';
import styles from './SettingsPage.module.css';

const THEME_LABEL = { system: '跟随系统', light: '常亮', dark: '常暗' } as const;

/**
 * 设置主页
 * 拆成 6 个界面：账号 / 偏好 / 通知 / 显示 / 隐私安全 / 个性化标签。
 * 本页为外壳，负责把各子页面串起来，并承载登录态相关入口。
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const theme = useAppearanceStore((s) => s.theme);
  const signOut = useAuthStore((s) => s.signOut);
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="设置" />

          {/* 账号卡：整块可点，直接进个人主页 */}
          <button type="button" className={styles.account} onClick={() => navigate('/me')}>
            <span className={styles.account__avatar}>
              <img src={CURRENT_USER.avatar_url} alt="" />
            </span>
            <span className={styles.account__body}>
              <span className={styles.account__name}>{CURRENT_USER.nickname}</span>
              <span className={styles.account__handle}>@{CURRENT_USER.handle}</span>
            </span>
          </button>

          <SettingsGroup>
            <SettingsRow
              icon={<UserRound size={19} strokeWidth={1.9} />}
              label="账号"
              desc="昵称、头像、简介、绑定手机与邮箱"
              to="/settings/account"
            />
            <SettingsRow
              icon={<SlidersHorizontal size={19} strokeWidth={1.9} />}
              label="偏好设置"
              desc="内容类别、个性化推荐"
              to="/settings/preferences"
            />
            <SettingsRow
              icon={<Bell size={19} strokeWidth={1.9} />}
              label="通知设置"
              desc="分类开关、免打扰时段"
              to="/settings/notifications"
            />
            <SettingsRow
              icon={<Monitor size={19} strokeWidth={1.9} />}
              label="显示设置"
              desc="深色模式、字号大小"
              to="/settings/display"
              control={<SettingsValue>{THEME_LABEL[theme]}</SettingsValue>}
            />
            <SettingsRow
              icon={<ShieldCheck size={19} strokeWidth={1.9} />}
              label="隐私与安全"
              desc="在线状态、私密账号、拉黑管理"
              to="/settings/privacy"
            />
          </SettingsGroup>

          <SettingsGroup title="内容管理">
            <SettingsRow
              icon={<Ban size={19} strokeWidth={1.9} />}
              label="黑名单"
              to="/settings/lists/topics"
              control={<SettingsValue>{MY_BLOCKED.length} 人</SettingsValue>}
            />
            <SettingsRow
              icon={<BellOff size={19} strokeWidth={1.9} />}
              label="静音列表"
              to="/settings/lists/topics"
              control={<SettingsValue>{MY_MUTED.length} 人</SettingsValue>}
            />
            <SettingsRow
              icon={<FileText size={19} strokeWidth={1.9} />}
              label="我关注的话题"
              to="/settings/lists/topics"
              control={<SettingsValue>{MY_TOPICS.length} 个</SettingsValue>}
            />
            <SettingsRow
              icon={<SlidersHorizontal size={19} strokeWidth={1.9} />}
              label="个性化标签"
              desc="查看和清理用于推荐的关键词标签"
              to="/settings/tags"
            />
          </SettingsGroup>

          <SettingsGroup title="其他">
            <SettingsRow
              icon={<Link2 size={19} strokeWidth={1.9} />}
              label="我的举报记录"
              desc="查看举报后的处置进度"
              to="/settings/reports"
            />
            <SettingsRow
              icon={<Info size={19} strokeWidth={1.9} />}
              label="关于 spreader"
              desc="版本 0.1.0 (demo)"
              to="/settings/about"
            />
            <SettingsRow
              icon={<LogOut size={19} strokeWidth={1.9} />}
              label="退出登录"
              danger
              onClick={() => setLogoutOpen(true)}
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        danger
        title="退出当前账号？"
        confirmText="退出登录"
        description="退出后需要重新登录才能发帖和查看消息。你的草稿会保留在本机。"
        onConfirm={() => {
          setLogoutOpen(false);
          signOut();
          toast.success('已退出登录');
          navigate('/login', { replace: true });
        }}
      />
    </AppShell>
  );
}
