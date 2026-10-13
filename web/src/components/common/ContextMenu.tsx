import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

/** 文档滚动容器当前的滚动量 */
function docScroll(): { x: number; y: number } {
  const el = document.scrollingElement ?? document.documentElement;
  return { x: el.scrollLeft, y: el.scrollTop };
}

/** 先量后放：按菜单实际尺寸把锚点收进视口，并记下被修正的偏移量 */
function measureAndPlace(el: HTMLElement, point: { x: number; y: number }) {
  const gap = 8;
  const maxLeft = window.innerWidth - el.offsetWidth - gap;
  const maxTop = window.innerHeight - el.offsetHeight - gap;
  const left = Math.max(gap, Math.min(point.x, maxLeft));
  const top = Math.max(gap, Math.min(point.y, maxTop));
  return { left, top, offsetX: left - point.x, offsetY: top - point.y };
}

/**
 * 右键菜单（浮层）
 * 贴着指针弹出，超出视口自动翻边；Esc / 点击外部关闭。
 */
export function ContextMenu({ point, items, onClose, ariaLabel = '操作菜单' }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  /* 打开时的锚点、视口修正量、文档滚动量——滚动时据此平移 */
  const baseRef = useRef<{
    point: { x: number; y: number };
    offsetX: number;
    offsetY: number;
    scroll: { x: number; y: number };
  } | null>(null);

  /* onClose 多为内联箭头函数，放进 ref 避免监听器反复重挂 */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const px = point?.x;
  const py = point?.y;

  /* 先量后放（layout 阶段改位置，绘制前完成，不会闪一下） */
  useLayoutEffect(() => {
    if (px === undefined || py === undefined) {
      baseRef.current = null;
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const placed = measureAndPlace(el, { x: px, y: py });
    baseRef.current = {
      point: { x: px, y: py },
      offsetX: placed.offsetX,
      offsetY: placed.offsetY,
      scroll: docScroll(),
    };
    setPos({ left: placed.left, top: placed.top });
  }, [px, py]);

  const open = px !== undefined && py !== undefined;

  useEffect(() => {
    if (!open) return;

    /* 焦点收进菜单，键盘可直接操作 */
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const inside = (target: EventTarget | null) => !!menuRef.current?.contains(target as Node);
    const onOutside = (e: Event) => {
      if (!inside(e.target)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };

    /* 文档滚动 → 跟着锚点一起走 */
    const onScroll = (e: Event) => {
      const t = e.target;
      const isDoc =
        t === document || t === window || t === document.documentElement || t === document.body;
      const base = baseRef.current;
      if (!isDoc || !base) {
        closeRef.current();
        return;
      }
      const cur = docScroll();
      setPos({
        left: base.point.x - (cur.x - base.scroll.x) + base.offsetX,
        top: base.point.y - (cur.y - base.scroll.y) + base.offsetY,
      });
    };

    const onResize = () => closeRef.current();

    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  /* 交给 onClick 用，先关再执行，避免菜单残留挡住确认弹窗 */
  const select = useCallback(
    (item: ContextMenuItem) => {
      closeRef.current();
      item.onSelect();
    },
    [],
  );

  if (!open) return null;

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
          onClick={() => select(item)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
