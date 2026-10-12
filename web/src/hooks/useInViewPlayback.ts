/**
 * 视口播放控制
 *
 *
 * 规则（这是列表式信息流与全屏沉浸流最本质的区别，必须做对）：
 *  - 卡片至少 50% 可见、且持续可见 > 300ms 才自动播放
 *  - 滚出视口立即暂停，但不重置进度（回滚可见时续播）
 *  - 同一时刻全局只允许 1 个视频有声音（默认全静音）
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  /** 触发播放的可见比例阈值 */
  threshold?: number;
  /** 持续可见多少毫秒后才真正播放（防快速滚动误触发） */
  dwellMs?: number;
}

export function useInViewPlayback({ threshold = 0.5, dwellMs = 300 }: Options = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        const visible =
          entry.isIntersecting && entry.intersectionRatio >= threshold;

        if (visible) {
          if (timerRef.current === null) {
            timerRef.current = window.setTimeout(() => {
              setInView(true);
              timerRef.current = null;
            }, dwellMs);
          }
        } else {
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          setInView(false);
        }
      },
      { threshold: [0, threshold, 0.75, 1] },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [threshold, dwellMs]);

  return { ref, inView };
}

/* -------------------------------------------------------------------------- */
/*  全局单音频协调                                                            */
/* -------------------------------------------------------------------------- */

let audibleOwner: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** 请求成为唯一有声视频 */
function claimAudible(owner: HTMLElement): void {
  audibleOwner = owner;
  listeners.forEach((fn) => fn());
}

function releaseAudible(owner: HTMLElement): void {
  if (audibleOwner === owner) {
    audibleOwner = null;
    listeners.forEach((fn) => fn());
  }
}

/**
 * 订阅"当前有声者"变化，判断自己是否仍持有。
 *
 * 默认静音：初始 isAudible 为 false，只有用户主动 claim 才会出声。
 * ref 指向的必须是**在整条视频生命周期内稳定存在**的节点（一般用外层容器），
 * 否则 <video> 一挂一卸会换节点，isAudible 就会和实际身份对不上。
 */
export function useAudible(ref: React.RefObject<HTMLElement | null>) {
  const [isAudible, setIsAudible] = useState(false);

  useEffect(() => {
    // 没有节点时不算持有：否则「audibleOwner 为 null」和「ref 为 null」相等，会误判成有声
    const check = () => setIsAudible(ref.current !== null && audibleOwner === ref.current);
    listeners.add(check);
    check();
    return () => {
      listeners.delete(check);
    };
  }, [ref]);

  const claim = useCallback(() => {
    if (ref.current) claimAudible(ref.current);
  }, [ref]);

  const release = useCallback(() => {
    if (ref.current) releaseAudible(ref.current);
  }, [ref]);

  return { isAudible, claim, release };
}
