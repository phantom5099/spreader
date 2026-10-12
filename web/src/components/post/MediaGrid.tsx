import { memo, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '@/types/feed';
import { formatDuration } from '@/utils/format';
import { useAudible } from '@/hooks/useInViewPlayback';
import styles from './MediaGrid.module.css';

interface MediaGridProps {
  media: MediaItem[];
  kind: 'photo' | 'video';
  /**
   * 父级是否希望这条播起来（信息流卡片由 IntersectionObserver 给值）。
   * 恒为 false 时只出封面，等用户点击再播（详情页即如此）。
   */
  playing?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  单条视频                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 起播有两个来源，取并集：父级自动播放、或用户主动点播（详情页封面）。
 *
 * 用户手动暂停后置 userPaused，直到父级再次切回"该播"（滚出又滚回）才复位 ——
 * 否则刚点暂停就会被 IntersectionObserver 立刻拉起，点了等于没点。
 *
 * 静音与否不在这里决定，交给全局单音频协调器：只有拿到"有声资格"的那一条才不静音，
 * 默认全部静音；某一条停下来时必须主动 release，否则资格被占着谁都不出声。
 */
const VideoTile = memo(function VideoTile({
  item,
  playing,
}: {
  item: MediaItem;
  playing: boolean;
}) {
  // 挂在常驻的外层容器上，而不是 <video> 上：<video> 会随播放态挂载/卸载，
  // 换节点会让 isAudible 与实际持有者对不上
  const tileRef = useRef<HTMLDivElement | null>(null);
  const [userStarted, setUserStarted] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const { isAudible, claim, release } = useAudible(tileRef);

  const active = (playing || userStarted) && !userPaused;

  // 父级重新要求播放时，清掉上一轮的手动暂停
  useEffect(() => {
    if (playing) setUserPaused(false);
  }, [playing]);

  useEffect(() => {
    if (!active) release();
  }, [active, release]);

  return (
    <div className={styles.video} ref={tileRef}>
      {active ? (
        <video
          src={item.url}
          poster={item.cover_url}
          autoPlay
          loop
          muted={!isAudible}
          playsInline
          preload="metadata"
          onClick={(e) => {
            e.stopPropagation();
            setUserPaused(true);
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.video__poster}
          style={{ backgroundImage: `url(${item.cover_url})` }}
          aria-label="播放视频"
          onClick={(e) => {
            e.stopPropagation();
            setUserStarted(true);
            setUserPaused(false);
          }}
        >
          <span className={styles.video__play}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {item.duration_ms ? (
        <span className={styles.video__duration}>{formatDuration(item.duration_ms)}</span>
      ) : null}

      {active ? (
        <button
          type="button"
          className={styles.video__mutedHint}
          aria-label={isAudible ? '静音' : '取消静音'}
          aria-pressed={isAudible}
          onClick={(e) => {
            e.stopPropagation();
            if (isAudible) release();
            else claim();
          }}
        >
          {isAudible ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </svg>
          )}
        </button>
      ) : null}
    </div>
  );
});

/**
 * 媒体区
 * 1/2/3/4/≥5 张各自布局；视频 16:9 + 时长角标 + 静音提示
 */
export const MediaGrid = memo(function MediaGrid({
  media,
  kind,
  playing = false,
}: MediaGridProps) {
  if (media.length === 0) return null;

  if (kind === 'video') {
    return <VideoTile item={media[0]!} playing={playing} />;
  }

  /* ---------- 单图 ---------- */
  if (media.length === 1) {
    const item = media[0]!;
    return (
      <div className={styles.single}>
        <img
          src={item.url}
          alt=""
          width={item.width}
          height={item.height}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  /* ---------- 多图 ---------- */
  const count = media.length;
  const visible = count >= 5 ? media.slice(0, 4) : media;
  const extra = count - visible.length;

  const variantClass =
    count === 2
      ? styles['grid--2']
      : count === 3
        ? styles['grid--3']
        : count === 4
          ? styles['grid--4']
          : styles['grid--many'];

  return (
    <div className={[styles.grid, variantClass].join(' ')}>
      {visible.map((m, i) => (
        <div className={styles.cell} key={`${m.url}-${i}`}>
          <img src={m.url} alt="" loading="lazy" decoding="async" />
          {extra > 0 && i === visible.length - 1 ? (
            <span className={styles.moreOverlay}>+{extra}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
});
