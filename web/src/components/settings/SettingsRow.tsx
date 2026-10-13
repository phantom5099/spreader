import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './SettingsRow.module.css';

/** 分组容器（分组间 16px 间距） */
export function SettingsGroup({
  title,
  desc,
  children,
}: {
  title?: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      {title ? <h2 className={styles.group__title}>{title}</h2> : null}
      <div className={styles.group__card}>{children}</div>
      {desc ? <p className={styles.group__desc}>{desc}</p> : null}
    </section>
  );
}

interface SettingsRowProps {
  icon?: ReactNode;
  label: string;
  /** 副标题 / 影响说明 */
  desc?: string;
  /** 右侧控件（开关 / 值 / 自定义） */
  control?: ReactNode;
  /** 是否可点击跳转（自动加右箭头） */
  to?: string;
  onClick?: () => void;
  /** 破坏性（红字） */
  danger?: boolean;
  /** 控件区放左侧（如单选打勾） */
  controlFirst?: boolean;
}

/**
 * 设置项：左侧标签 + 右侧控件（统一范式）
 */
export function SettingsRow({
  icon,
  label,
  desc,
  control,
  to,
  onClick,
  danger = false,
  controlFirst = false,
}: SettingsRowProps) {
  const navigate = useNavigate();
  const clickable = Boolean(to || onClick);

  const handle = () => {
    if (to) navigate(to);
    else onClick?.();
  };

  const content = (
    <>
      {icon ? (
        <span className={styles.row__icon} aria-hidden>
          {icon}
        </span>
      ) : null}

      {controlFirst ? (
        <span className={styles.row__controlFirst}>{control}</span>
      ) : null}

      <span className={styles.row__body}>
        <span className={[styles.row__label, danger ? styles['row__label--danger'] : ''].filter(Boolean).join(' ')}>
          {label}
        </span>
        {desc ? <span className={styles.row__desc}>{desc}</span> : null}
      </span>

      {!controlFirst ? <span className={styles.row__control}>{control}</span> : null}

      {clickable ? (
        <span className={styles.row__chevron} aria-hidden>
          <ChevronRight size={18} strokeWidth={2} />
        </span>
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button type="button" className={[styles.row, styles['row--clickable']].join(' ')} onClick={handle}>
        {content}
      </button>
    );
  }

  return <div className={styles.row}>{content}</div>;
}

/** 开关控件 */
export function SettingsSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={[
        styles.switch,
        checked ? styles['switch--on'] : '',
        disabled ? styles['switch--disabled'] : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span className={styles.switch__knob} />
    </button>
  );
}

/** 值文本（右侧显示的当前值） */
export function SettingsValue({ children }: { children: ReactNode }) {
  return <span className={styles.value}>{children}</span>;
}
