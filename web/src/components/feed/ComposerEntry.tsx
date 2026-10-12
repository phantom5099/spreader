import { useNavigate } from 'react-router-dom';
import { Image, Film, ListPlus, MapPin, Smile } from 'lucide-react';
import { CURRENT_USER } from '@/mocks/currentUser';
import styles from './ComposerEntry.module.css';

/**
 * 发帖入口
 * 这里**不内联展开**编辑区 —— 点击后进入独立发帖页，
 * 整行可点 / 图标可点 / 按钮可点，都去 /compose。
 */
export function ComposerEntry() {
  const navigate = useNavigate();
  const go = () => navigate('/compose');

  return (
    <div
      className={styles.composer}
      role="button"
      tabIndex={0}
      aria-label="发帖"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
    >
      <span className={styles.composer__avatar}>
        {CURRENT_USER.avatar_url ? <img src={CURRENT_USER.avatar_url} alt="" /> : null}
      </span>

      <div className={styles.composer__body}>
        <span className={styles.composer__placeholder}>有什么新鲜事？</span>

        <div className={styles.composer__bar}>
          <div className={styles.composer__tools}>
            <button type="button" className={styles.composer__tool} aria-label="添加图片" onClick={stop(go)}>
              <Image size={19} strokeWidth={1.9} aria-hidden />
            </button>
            <button type="button" className={styles.composer__tool} aria-label="添加视频" onClick={stop(go)}>
              <Film size={19} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              className={[styles.composer__tool, styles['composer__tool--muted']].join(' ')}
              aria-label="投票（暂未开放）"
              title="投票 · 暂未开放"
              onClick={stop(go)}
            >
              <ListPlus size={19} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              className={[styles.composer__tool, styles['composer__tool--muted']].join(' ')}
              aria-label="位置（暂未开放）"
              title="位置 · 暂未开放"
              onClick={stop(go)}
            >
              <MapPin size={19} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              className={[styles.composer__tool, styles['composer__tool--muted']].join(' ')}
              aria-label="表情（暂未开放）"
              title="表情 · 暂未开放"
              onClick={stop(go)}
            >
              <Smile size={19} strokeWidth={1.9} aria-hidden />
            </button>
          </div>

          <button type="button" className={styles.composer__submit} onClick={stop(go)}>
            发帖
          </button>
        </div>
      </div>
    </div>
  );
}

function stop(fn: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
}
