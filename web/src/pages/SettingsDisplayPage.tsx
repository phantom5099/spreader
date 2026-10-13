import { useNavigate } from 'react-router-dom';
import { Check, Monitor, Moon, Repeat, Smartphone, Sun, Type } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/components/settings/SettingsRow';
import {
  FONT_LABELS,
  FONT_SCALES,
  useAppearanceStore,
  type FontScaleIndex,
  type ThemeMode,
} from '@/stores/appearanceStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import styles from './SettingsDisplayPage.module.css';

const THEME_OPTIONS: Array<{ key: ThemeMode; label: string; desc: string; icon: typeof Sun }> = [
  { key: 'system', label: '跟随系统', desc: '随设备的深色模式自动切换', icon: Monitor },
  { key: 'light', label: '常亮', desc: '始终使用浅色界面', icon: Sun },
  { key: 'dark', label: '常暗', desc: '始终使用深色界面', icon: Moon },
];

/**
 * 显示设置
 * Demo 完成度关键 —— 深色模式 + 字号调节必须可用。
 *   1. 切换深色模式时全部页面无闪白
 *   2. 字号调至最大时布局不截断
 */
export function SettingsDisplayPage() {
  const navigate = useNavigate();
  const theme = useAppearanceStore((s) => s.theme);
  const fontScale = useAppearanceStore((s) => s.fontScale);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setFontScale = useAppearanceStore((s) => s.setFontScale);

  /* 播放偏好：循环播放默认开启，关掉就变成"播完自动切下一条" */
  const videoLoop = usePreferencesStore((s) => s.video_loop);
  const setVideoLoop = usePreferencesStore((s) => s.setVideoLoop);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="显示设置" onBack={() => navigate('/settings')} />

          {/* ---------- 深色模式 ---------- */}
          <SettingsGroup
            title="深色模式"
            desc="切换时整站同步生效，不会出现先亮后暗的闪白。选择会保存在本机。"
          >
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.key;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={[styles.row, active ? styles['row--active'] : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setTheme(opt.key)}
                  aria-pressed={active}
                >
                  <span className={styles.row__icon} aria-hidden>
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  <span className={styles.row__body}>
                    <span className={styles.row__label}>{opt.label}</span>
                    <span className={styles.row__desc}>{opt.desc}</span>
                  </span>
                  <span
                    className={[styles.row__check, active ? styles['row__check--on'] : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden
                  >
                    {active ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })}
          </SettingsGroup>

          {/* ---------- 字号调节 ---------- */}
          <SettingsGroup
            title="字号"
            desc="影响全站文字大小。调至最大时，长文本与按钮文字都不会被截断。"
          >
            <div className={styles.slider}>
              <div className={styles.slider__labels}>
                {FONT_LABELS.map((label, i) => (
                  <span
                    key={label}
                    className={[styles.slider__label, i === fontScale ? styles['slider__label--on'] : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <input
                className={styles.slider__input}
                type="range"
                min={0}
                max={3}
                step={1}
                value={fontScale}
                aria-label="字号档位"
                aria-valuetext={FONT_LABELS[fontScale]}
                onChange={(e) => setFontScale(Number(e.target.value) as FontScaleIndex)}
              />

              <div className={styles.slider__ticks} aria-hidden>
                {FONT_SCALES.map((s) => (
                  <span key={s} className={styles.slider__tick} />
                ))}
              </div>
            </div>

            {/* 实时预览 */}
            <div className={styles.preview}>
              <span className={styles.preview__head}>
                <Type size={15} strokeWidth={2} aria-hidden />
                预览 · {FONT_LABELS[fontScale]}（{Math.round(FONT_SCALES[fontScale] * 100)}%）
              </span>
              <div className={styles.preview__post}>
                <span className={styles.preview__avatar} aria-hidden />
                <div className={styles.preview__body}>
                  <span className={styles.preview__name}>
                    林知夏 <span className={styles.preview__handle}>@zhixia · 2小时</span>
                  </span>
                  <p className={styles.preview__text}>
                    写代码最难的部分其实不是写，是想清楚到底要写什么。每次卡住的时候，通常不是因为不会语法，而是需求本身没想明白。
                  </p>
                  <div className={styles.preview__actions}>
                    <span>12 回复</span>
                    <span>48 转推</span>
                    <span>386 赞</span>
                  </div>
                </div>
              </div>
            </div>
          </SettingsGroup>

          {/* ---------- 其他显示项 ---------- */}
          <SettingsGroup>
            <SettingsRow
              icon={<Repeat size={19} strokeWidth={1.9} />}
              label="短视频循环播放"
              desc={
                videoLoop
                  ? '单条播完回到开头，不自动跳下一条'
                  : '单条播完自动切到下一条'
              }
              control={<SettingsSwitch checked={videoLoop} onChange={setVideoLoop} />}
            />
            <SettingsRow
              icon={<Smartphone size={19} strokeWidth={1.9} />}
              label="自动播放视频"
              desc="仅在连接到 Wi-Fi 时自动播放"
              control={<ReadOnlySwitch on />}
            />
            <SettingsRow
              icon={<Smartphone size={19} strokeWidth={1.9} />}
              label="无图模式"
              desc="流量受限时只加载文字"
              control={<ReadOnlySwitch on={false} />}
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

/** 展示用静态开关（Demo：这两项只做视觉呈现，不接真实能力） */
function ReadOnlySwitch({ on }: { on: boolean }) {
  return (
    <span
      className={[styles.roSwitch, on ? styles['roSwitch--on'] : ''].filter(Boolean).join(' ')}
      aria-hidden
    >
      <span className={styles.roSwitch__knob} />
    </span>
  );
}
