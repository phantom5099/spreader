import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, UserPlus } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { CURRENT_USER } from '@/mocks/currentUser';
import styles from './AccountMenu.module.css';

interface MenuEntry {
  key: string;
  label: string;
  icon: typeof Settings;
  to?: string;
  danger?: boolean;
  separatorBefore?: boolean;
}

const ENTRIES: MenuEntry[] = [
  { key: 'add', label: '添加现有账号', icon: UserPlus },
  { key: 'settings', label: '设置与隐私', icon: Settings, to: '/settings', separatorBefore: true },
  { key: 'logout', label: '退出登录', icon: LogOut, danger: true, separatorBefore: true },
];

export function AccountMenu() {
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);

  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /** 菜单相对视口的定位（fixed） */
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  /* 定位：贴着触发按钮的上方 */
  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: rect.left,
      /* 菜单底边 = 视口高 - 按钮顶边 + 间距 */
      bottom: window.innerHeight - rect.top + 10,
    });
  }, [open]);

  /* 滚动 / 缩放时跟着走（左导航可滚动） */
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ left: rect.left, bottom: window.innerHeight - rect.top + 10 });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  /* 点击外部 / Esc 关闭 */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleEntry = useCallback(
    (entry: MenuEntry) => {
      setOpen(false);

      if (entry.key === 'logout') {
        setConfirmOpen(true);
        return;
      }
      if (entry.key === 'add') {
        toast.show('添加账号功能暂未开放（Demo）');
        return;
      }
      if (entry.to) navigate(entry.to);
    },
    [navigate],
  );

  const doSignOut = useCallback(() => {
    setConfirmOpen(false);
    signOut();
    toast.success('已退出登录');
    navigate('/login', { replace: true });
  }, [navigate, signOut]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            aria-label="账号菜单"
            style={{ left: pos.left, bottom: pos.bottom }}
          >
            <div className={styles.menu__head}>
              <span className={styles.menu__avatar}>
                {CURRENT_USER.avatar_url ? <img src={CURRENT_USER.avatar_url} alt="" /> : null}
              </span>
              <span className={styles.menu__name}>{CURRENT_USER.nickname}</span>
              <span className={styles.menu__handle}>@{CURRENT_USER.handle}</span>
            </div>

            {ENTRIES.map((entry) => (
              <div key={entry.key}>
                {entry.separatorBefore ? <span className={styles.menu__sep} aria-hidden /> : null}
                <button
                  type="button"
                  role="menuitem"
                  className={[styles.menu__item, entry.danger ? styles['menu__item--danger'] : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleEntry(entry)}
                >
                  <entry.icon size={18} strokeWidth={1.9} aria-hidden />
                  <span>{entry.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className={styles.root}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="账号菜单"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.trigger__avatar}>
            {CURRENT_USER.avatar_url ? <img src={CURRENT_USER.avatar_url} alt="" /> : null}
          </span>
          <span className={styles.trigger__meta}>
            <span className={styles.trigger__name}>{CURRENT_USER.nickname}</span>
            <span className={styles.trigger__handle}>@{CURRENT_USER.handle}</span>
          </span>
        </button>
      </div>

      {menu}

      {/* ---------- 退出的二次确认 ---------- */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        danger
        title="退出当前账号？"
        confirmText="退出登录"
        description="退出后需要重新登录才能发帖和查看消息。你的草稿会保留在本机。"
        onConfirm={doSignOut}
      />
    </>
  );
}
