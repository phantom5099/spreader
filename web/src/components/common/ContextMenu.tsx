import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  key: string;
  label: string;
  /** 直接给 <Icon size={16} strokeWidth={1.9} aria-hidden /> */
  icon?: ReactNode;
  /** 破坏性操作（红色） */
  danger?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  /** 打开位置（视口坐标，通常是右键的 clientX/clientY）；null 表示关闭 */
  point: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
}

/**
 * 右键菜单（浮层）
 * 贴着指针弹出，超出视口自动翻边；Esc / 点击外部 / 滚动 / 缩放时关闭。
 */
export function ContextMenu({ point, items, onClose, ariaLabel = '操作菜单' }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  /* 先量后放（layout 阶段改位置，绘制前完成，不会闪一下） */
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!point || !el) return;
    const gap = 8;
    const maxLeft = window.innerWidth - el.offsetWidth - gap;
    const maxTop = window.innerHeight - el.offsetHeight - gap;
    setPos({
      left: Math.max(gap, Math.min(point.x, maxLeft)),
      top: Math.max(gap, Math.min(point.y, maxTop)),
    });
  }, [point]);

  useEffect(() => {
    if (!point) return;

    /* 焦点收进菜单，键盘可直接操作 */
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const inside = (target: EventTarget | null) => !!menuRef.current?.contains(target as Node);
    const onOutside = (e: Event) => {
      if (!inside(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onViewportChange = () => onClose();

    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);

    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [point, onClose]);

  if (!point) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ariaLabel}
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={[styles.item, item.danger ? styles['item--danger'] : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
