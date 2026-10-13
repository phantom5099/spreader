import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle } from 'lucide-react';
import { toast } from '@/stores/toastStore';
import { toggleFollowApi } from '@/mocks/api';
import type { FollowRelation } from '@/types/user';
import styles from './FollowButton.module.css';

interface FollowButtonProps {
  /** 进入页面时的初始关系 */
  relation: FollowRelation;
  /** 受控的当前关注状态 */
  following: boolean;
  isSelf: boolean;
  onChange?: (next: boolean) => void;
  onEditProfile?: () => void;
  /**
   * 传入后开启「分裂」形态：
   *   未关注 = 一个实心「关注」；已关注 = 白色圆形聊天按钮 + 蓝色「取消关注」。
   * 不传就退回原来的单按钮（列表里的小号按钮用不着这套）。
   */
  onChat?: () => void;
  /** 聊天按钮的无障碍名，形如 `给 @zhixia 发消息` */
  chatLabel?: string;
  /** 列表场景用小号按钮 */
  size?: 'md' | 'sm';
}

/** 分裂 / 合并动画时长，和 CSS 里的关键帧保持一致 */
const MORPH_MS = 440;
/** 粒子飞散的总时长（含最晚的 delay） */
const BURST_MS = 860;
const DOT_COUNT = 18;

interface Dot {
  id: number;
  /** 飞散终点偏移 */
  dx: number;
  dy: number;
  size: number;
  delay: number;
  /** 全部走语义令牌，明暗主题下都有对比度 */
  tone: 'blue' | 'accent' | 'neutral';
}

const DOT_TONES: Dot['tone'][] = ['blue', 'accent', 'neutral'];

/** 一次性算好每个粒子的方向/距离，避免重渲染时抖动 */
function makeDots(): Dot[] {
  return Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle = (Math.PI * 2 * i) / DOT_COUNT + (Math.random() - 0.5) * 0.5;
    const dist = 26 + Math.random() * 36;
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      size: 4.5 + Math.random() * 4.5,
      delay: Math.round(Math.random() * 70),
      tone: DOT_TONES[i % DOT_TONES.length]!,
    };
  });
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * 关注按钮状态机
 *
 * 不传 onChat（列表场景）：
 *   未关注 → 实心主色「关注」；已关注 → 描边「取消关注」，hover 转红
 * 传 onChat（个人主页头部）：
 *   未关注 → 一个实心「关注」
 *   已关注 → 左边白色圆形聊天按钮 + 右边蓝色「取消关注」
 *   点关注时像水滴一样分裂出聊天圆钮；点取消时两者合并、散成粒子，回到「关注」
 *
 * 文案在常态就写明取消关注，不藏在 hover 里——触屏没有 hover 这一步。
 */
export function FollowButton({
  relation,
  following,
  isSelf,
  onChange,
  onEditProfile,
  onChat,
  chatLabel = '发消息',
  size = 'md',
}: FollowButtonProps) {
  const [hovering, setHovering] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 点击后先切视觉、不等接口：动画要跟手，接口回来再对齐 */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [morph, setMorph] = useState<'split' | 'merge' | null>(null);
  const [burst, setBurst] = useState<{ x: number; y: number; dots: Dot[] } | null>(null);

  const chatRef = useRef<HTMLButtonElement | null>(null);
  const timers = useRef<number[]>([]);

  const sizeClass = size === 'sm' ? styles['follow--sm'] : '';
  const shown = optimistic ?? following;
  /** 只有头部那个位置才分裂：圆形聊天按钮在头像行里说得通，夹在列表里太抢 */
  const splittable = Boolean(onChat) && !isSelf && size === 'md';

  /* 接口结果落到 following 后，乐观值就可以退场了 */
  useEffect(() => {
    setOptimistic(null);
  }, [following]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  if (isSelf) {
    return (
      <button
        type="button"
        className={[styles.follow, styles['follow--self'], sizeClass].filter(Boolean).join(' ')}
        onClick={onEditProfile}
      >
        编辑资料
      </button>
    );
  }

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const handleClick = () => {
    if (busy) return;
    setBusy(true);

    const next = !shown;
    const animate = splittable && !prefersReducedMotion();
    setOptimistic(next);

    if (animate && next) {
      setMorph('split');
      later(() => setMorph(null), MORPH_MS);
    }
    if (animate && !next) {
      /* 粒子从聊天圆当前的位置散开，所以要在它被收起之前量一次 */
      const rect = chatRef.current?.getBoundingClientRect();
      if (rect) {
        setBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, dots: makeDots() });
        later(() => setBurst(null), BURST_MS);
      }
      setMorph('merge');
      later(() => setMorph(null), MORPH_MS);
    }

    void toggleFollowApi(shown ? relation : 'other', next)
      .then(() => {
        onChange?.(next);
        toast.success(next ? '已关注，TA 的最新动态会出现在你的关注流' : '已取消关注');
      })
      .catch(() => {
        setOptimistic(null);
        setMorph(null);
        setBurst(null);
        toast.error('操作失败，请稍后重试');
      })
      .finally(() => setBusy(false));
  };

  const label = shown ? '取消关注' : '关注';

  const cls = [
    styles.follow,
    splittable
      ? shown
        ? styles['follow--split-on']
        : styles['follow--none']
      : shown
        ? styles['follow--following']
        : styles['follow--none'],
    !splittable && shown && hovering ? styles['follow--canceling'] : '',
    splittable && shown && hovering ? styles['follow--split-hover'] : '',
    busy ? styles['follow--busy'] : '',
    sizeClass,
  ]
    .filter(Boolean)
    .join(' ');

  const button = (
    <button
      type="button"
      className={cls}
      aria-pressed={shown}
      aria-label={shown ? '取消关注' : '关注'}
      disabled={busy}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onClick={handleClick}
    >
      {/* key 跟着文案走：换字时重新挂载一次，动画才会重放 */}
      <span
        key={label}
        className={[styles.follow__label, morph ? styles['follow__label--anim'] : '']
          .filter(Boolean)
          .join(' ')}
      >
        {label}
      </span>
    </button>
  );

  if (!splittable) return button;

  return (
    <>
      <div className={styles.split} data-on={shown} data-morph={morph ?? undefined}>
        <span className={styles.split__chatSlot}>
          <button
            ref={chatRef}
            type="button"
            className={styles.chat}
            aria-label={chatLabel}
            aria-hidden={!shown}
            tabIndex={shown ? 0 : -1}
            disabled={!shown || busy}
            onClick={onChat}
          >
            <MessageCircle size={18} strokeWidth={2} aria-hidden />
          </button>
        </span>

        {button}
      </div>

      {/* 粒子层挂在 body 上：按钮自身带动画（transform 会改 containing block），
          留在原地会让 fixed 定位失效 */}
      {burst
        ? createPortal(
            <span
              className={styles.burst}
              style={{ left: burst.x, top: burst.y }}
              aria-hidden
            >
              {burst.dots.map((d) => (
                <span
                  key={d.id}
                  className={[styles.dot, styles[`dot--${d.tone}`]].join(' ')}
                  style={
                    {
                      '--dot-dx': `${d.dx}px`,
                      '--dot-dy': `${d.dy}px`,
                      '--dot-size': `${d.size}px`,
                      '--dot-delay': `${d.delay}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
