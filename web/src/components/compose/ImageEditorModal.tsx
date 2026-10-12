import { useEffect, useRef, useState } from 'react';
import { Crop, RotateCw, Sun, Contrast, Wand2, Undo2, Check } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import type { DraftMedia } from '@/types/draft';
import styles from './ImageEditorModal.module.css';

type Tool = 'crop' | 'rotate' | 'brightness' | 'contrast' | 'filter';

interface ImageEditorModalProps {
  open: boolean;
  media: DraftMedia | null;
  onClose: () => void;
  onSave: (edited: DraftMedia) => void;
}

interface EditState {
  rotate: number;
  brightness: number;
  contrast: number;
  saturate: number;
  filter: string;
}

const FILTERS = [
  { key: 'none', label: '原图', css: 'none', saturate: 100 },
  { key: 'warm', label: '暖阳', css: 'sepia(0.22) saturate(1.15)', saturate: 115 },
  { key: 'cool', label: '冷调', css: 'hue-rotate(-12deg) saturate(1.1)', saturate: 110 },
  { key: 'mono', label: '黑白', css: 'grayscale(1)', saturate: 0 },
  { key: 'film', label: '胶片', css: 'sepia(0.35) contrast(1.08) saturate(0.9)', saturate: 90 },
];

const INITIAL: EditState = { rotate: 0, brightness: 100, contrast: 100, saturate: 100, filter: 'none' };

/**
 * 图片编辑模态
 * 必须保留外层编辑态 —— 模态关闭后图片回填，文字与配置不丢。
 * Demo 用 CSS filter 实时预览（真实实现应走 canvas 导出新文件）。
 */
export function ImageEditorModal({ open, media, onClose, onSave }: ImageEditorModalProps) {
  const [tool, setTool] = useState<Tool>('filter');
  const [state, setState] = useState<EditState>(INITIAL);
  const [history, setHistory] = useState<EditState[]>([]);

  const mediaIdRef = useRef<string | null>(null);

  /* 切换图片时重置 */
  useEffect(() => {
    if (media && media.id !== mediaIdRef.current) {
      mediaIdRef.current = media.id;
      setState(INITIAL);
      setHistory([]);
      setTool('filter');
    }
  }, [media]);

  if (!media) {
    return (
      <Modal open={false} onClose={onClose} title="编辑图片">
        {null}
      </Modal>
    );
  }

  const patch = (p: Partial<EditState>) => {
    setHistory((h) => [...h, state]);
    setState((s) => ({ ...s, ...p }));
  };

  const undo = () => {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last) setState(last);
      return h.slice(0, -1);
    });
  };

  const activeFilter = FILTERS.find((f) => f.key === state.filter) ?? FILTERS[0]!;

  const previewStyle: React.CSSProperties = {
    transform: `rotate(${state.rotate}deg)`,
    filter: [
      `brightness(${state.brightness}%)`,
      `contrast(${state.contrast}%)`,
      activeFilter.css === 'none' ? '' : activeFilter.css,
    ]
      .filter(Boolean)
      .join(' '),
    transition: 'filter 120ms, transform 200ms',
  };

  const save = () => {
    // Demo：把编辑参数编码进 url 片段，仅用于演示"回填后仍是编辑后的样子"
    const tag = `${state.filter}_b${state.brightness}_c${state.contrast}_r${state.rotate}`;
    onSave({ ...media, url: `${media.url}#${tag}` });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑图片"
      size="lg"
      headActions={
        <>
          <button
            type="button"
            className={styles.headBtn}
            onClick={undo}
            disabled={history.length === 0}
            aria-label="撤销"
          >
            <Undo2 size={18} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
            style={{ height: 32, padding: '0 16px' }}
            onClick={save}
          >
            <Check size={15} strokeWidth={2.4} aria-hidden />
            保存
          </button>
        </>
      }
    >
      {/* 预览区 */}
      <div className={styles.stage}>
        <img src={media.url} alt="" style={previewStyle} />
      </div>

      {/* 参数面板 */}
      <div className={styles.panel}>
        {tool === 'crop' ? (
          <div className={styles.cropRow}>
            {[
              { label: '原始', ratio: '4 / 3' },
              { label: '1:1', ratio: '1 / 1' },
              { label: '16:9', ratio: '16 / 9' },
              { label: '3:4', ratio: '3 / 4' },
            ].map((c) => (
              <button
                key={c.label}
                type="button"
                className={styles.cropChip}
                onClick={() => patch({})}
              >
                <span className={styles.cropChip__box} style={{ aspectRatio: c.ratio }} />
                {c.label}
              </button>
            ))}
          </div>
        ) : null}

        {tool === 'rotate' ? (
          <div className={styles.sliderRow}>
            <button
              type="button"
              className={styles.rotBtn}
              onClick={() => patch({ rotate: (state.rotate + 90) % 360 })}
            >
              <RotateCw size={17} strokeWidth={2} aria-hidden />
              顺时针 90°
            </button>
            <button
              type="button"
              className={styles.rotBtn}
              onClick={() => patch({ rotate: (state.rotate + 270) % 360 })}
            >
              <RotateCw size={17} strokeWidth={2} style={{ transform: 'scaleX(-1)' }} aria-hidden />
              逆时针 90°
            </button>
            <button type="button" className={styles.rotBtn} onClick={() => patch({ rotate: 0 })}>
              重置角度
            </button>
          </div>
        ) : null}

        {tool === 'brightness' ? (
          <label className={styles.sliderRow}>
            <Sun size={17} strokeWidth={2} color="var(--text-secondary)" aria-hidden />
            <input
              type="range"
              min={40}
              max={160}
              value={state.brightness}
              onChange={(e) => setState((s) => ({ ...s, brightness: Number(e.target.value) }))}
              onMouseDown={() => setHistory((h) => [...h, state])}
              className={styles.slider}
              aria-label="亮度"
            />
            <span className={styles.sliderVal}>{state.brightness}</span>
          </label>
        ) : null}

        {tool === 'contrast' ? (
          <label className={styles.sliderRow}>
            <Contrast size={17} strokeWidth={2} color="var(--text-secondary)" aria-hidden />
            <input
              type="range"
              min={40}
              max={180}
              value={state.contrast}
              onChange={(e) => setState((s) => ({ ...s, contrast: Number(e.target.value) }))}
              onMouseDown={() => setHistory((h) => [...h, state])}
              className={styles.slider}
              aria-label="对比度"
            />
            <span className={styles.sliderVal}>{state.contrast}</span>
          </label>
        ) : null}

        {tool === 'filter' ? (
          <div className={styles.filterRow}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={[styles.filterCell, state.filter === f.key ? styles['filterCell--on'] : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => patch({ filter: f.key })}
              >
                <span
                  className={styles.filterCell__thumb}
                  style={{
                    backgroundImage: `url(${media.url})`,
                    filter: f.css === 'none' ? undefined : f.css,
                  }}
                />
                <span className={styles.filterCell__label}>{f.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        {(
          [
            { key: 'crop', label: '裁剪', icon: Crop },
            { key: 'rotate', label: '旋转', icon: RotateCw },
            { key: 'brightness', label: '亮度', icon: Sun },
            { key: 'contrast', label: '对比度', icon: Contrast },
            { key: 'filter', label: '滤镜', icon: Wand2 },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={[styles.toolBtn, tool === key ? styles['toolBtn--on'] : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTool(key)}
          >
            <Icon size={19} strokeWidth={1.9} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
