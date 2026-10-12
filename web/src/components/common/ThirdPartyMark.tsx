import { CircleDashed } from 'lucide-react';
import styles from './ThirdPartyMark.module.css';

interface ThirdPartyMarkProps {
  /** 无障碍标签：说明这是哪个渠道的占位（如"第三方账号登录"） */
  label?: string;
  size?: number;
  /** 是否在图标旁补一句"暂未开放"的说明文字 */
  withHint?: boolean;
}

/**
 * 第三方登录占位标识
 */
export function ThirdPartyMark({ label, size = 20, withHint = false }: ThirdPartyMarkProps) {
  return (
    <span className={styles.mark}>
      <CircleDashed size={size} strokeWidth={1.9} aria-hidden />
      <span className="visually-hidden">{label ? `${label}（暂未接通）` : '第三方渠道（暂未接通）'}</span>
      {withHint ? (
        <span style={{ marginLeft: 6, fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
          暂未开放
        </span>
      ) : null}
    </span>
  );
}
