import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  UploadCloud,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import { useDraftStore } from '@/stores/draftStore';
import type { Draft, PublishStage } from '@/types/draft';
import { toast } from '@/stores/toastStore';
import styles from './PublishingPage.module.css';

interface StepDef {
  key: Exclude<PublishStage, 'idle'>;
  label: string;
  hint: string;
  icon: typeof UploadCloud;
}

const STEPS: StepDef[] = [
  { key: 'uploading', label: '上传中', hint: '正在上传媒体文件', icon: UploadCloud },
  { key: 'transcoding', label: '转码中', hint: '正在生成多档清晰度', icon: Loader2 },
  { key: 'reviewing', label: '审核中', hint: '通常几分钟内完成', icon: Clock },
  { key: 'published', label: '已发布', hint: '内容已对可见范围的人展示', icon: CheckCircle2 },
];

const STAGE_ORDER: PublishStage[] = ['uploading', 'transcoding', 'reviewing', 'published'];

export function PublishingPage() {
  const { draftId = '' } = useParams();
  const navigate = useNavigate();

  const progress = useDraftStore((s) => s.progress);
  const runPublish = useDraftStore((s) => s.runPublish);
  const resetProgress = useDraftStore((s) => s.resetProgress);
  const refresh = useDraftStore((s) => s.refresh);
  /* 草稿只在挂载时读一次快照：渲染期直接订阅 store 会随发布状态机的
     每次 set（约 9 次）一起重算，这里用 state 固定下来。 */
  const [draft, setDraft] = useState<Draft | undefined>(undefined);

  const startedRef = useRef(false);

  /* -------------------- 启动状态机 -------------------- */
  useEffect(() => {
    void refresh();
    setDraft(useDraftStore.getState().get(draftId));
  }, [refresh, draftId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void runPublish().then((result) => {
      if (result === 'published') {
        // 发布成功：从草稿箱移除，并提示
        useDraftStore.getState().remove(draftId);
        toast.success('发布成功');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  const retry = async () => {
    resetProgress();
    const result = await runPublish();
    if (result === 'published') {
      useDraftStore.getState().remove(draftId);
      toast.success('发布成功');
    }
  };

  const stage = progress.stage;
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const isDone = stage === 'published';
  const isProblem = stage === 'rejected' || stage === 'failed';

  /* -------------------- 主图标与文案 -------------------- */
  const headline =
    stage === 'uploading'
      ? '正在上传'
      : stage === 'transcoding'
        ? '正在转码'
        : stage === 'reviewing'
          ? '审核中'
          : stage === 'published'
            ? '已发布'
            : stage === 'rejected'
              ? '未通过审核'
              : stage === 'failed'
                ? '发布失败'
                : '准备中';

  const sub =
    stage === 'reviewing'
      ? '内容正在审核，仅你自己可见。通常几分钟内完成。'
      : stage === 'published'
        ? '你的动态已经发布，可以分享给朋友了。'
        : stage === 'rejected'
          ? '你可以查看具体原因并申诉，或修改后重新发布。'
          : stage === 'failed'
            ? '上传或转码失败，内容已保留为草稿，可以直接重试。'
            : '请保持网络连接，离开此页面不会中断发布。';

  const coreClass = [
    styles.iconWrap__core,
    isProblem ? styles['iconWrap__core--danger'] : '',
    stage === 'reviewing' ? styles['iconWrap__core--warn'] : '',
    isDone ? styles['iconWrap__core--ok'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  /* 进度环（上传阶段用百分比，其余用不确定动画） */
  const R = 44;
  const C = 2 * Math.PI * R;
  const determinate = stage === 'uploading';
  const offset = determinate ? C * (1 - progress.percent / 100) : 0;

  return (
    <div className={styles.page}>
      {isDone || isProblem ? (
        <button type="button" className={styles.backLink} onClick={() => navigate('/')}>
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          返回首页
        </button>
      ) : null}

      <div className={styles.card}>
        {/* ---------- 主图标 ---------- */}
        <div className={styles.iconWrap}>
          <svg className={styles.iconWrap__ring} width={96} height={96} aria-hidden>
            <circle
              cx={48}
              cy={48}
              r={R}
              fill="none"
              stroke="var(--border)"
              strokeWidth={3}
            />
            <circle
              cx={48}
              cy={48}
              r={R}
              fill="none"
              stroke={isProblem ? 'var(--danger)' : isDone ? 'var(--repost)' : 'var(--accent)'}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke-dashoffset 320ms cubic-bezier(.16,1,.3,1)',
              }}
            />
          </svg>

          <span className={coreClass}>
            {stage === 'uploading' ? <UploadCloud size={28} strokeWidth={2} aria-hidden /> : null}
            {stage === 'transcoding' ? (
              <Loader2 size={28} strokeWidth={2} className={styles.spin} aria-hidden />
            ) : null}
            {stage === 'reviewing' ? <Clock size={28} strokeWidth={2} aria-hidden /> : null}
            {stage === 'published' ? <CheckCircle2 size={28} strokeWidth={2} aria-hidden /> : null}
            {stage === 'rejected' ? <AlertTriangle size={28} strokeWidth={2} aria-hidden /> : null}
            {stage === 'failed' ? <RefreshCw size={28} strokeWidth={2} aria-hidden /> : null}
          </span>
        </div>

        {/* ---------- 文案 ---------- */}
        <h1 className={styles.title}>{headline}</h1>
        <p className={styles.desc}>
          {sub}
          {stage === 'rejected' && progress.reason ? (
            <>
              <br />
              <span className={styles.desc__reason}>原因类别：{progress.reason}</span>
            </>
          ) : null}
        </p>

        {/* ---------- 媒体预览 ---------- */}
        {draft && draft.media.length > 0 ? (
          <div className={styles.preview}>
            {draft.media.slice(0, 4).map((m) => (
              <span
                key={m.id}
                className={[styles.preview__cell, isProblem ? styles['preview__cell--blur'] : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <img src={m.url} alt="" />
              </span>
            ))}
          </div>
        ) : null}

        {/* ---------- 四阶段步骤 ---------- */}
        {!isProblem ? (
          <div className={styles.steps}>
            {STEPS.map((s) => {
              const stepIdx = STAGE_ORDER.indexOf(s.key);
              const done = currentIndex > stepIdx;
              const active = currentIndex === stepIdx;
              const Icon = s.icon;

              const dotClass = [
                styles.step__dot,
                active ? styles['step__dot--active'] : '',
                done ? styles['step__dot--done'] : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div className={styles.step} key={s.key}>
                  <span
                    className={[
                      styles.step__line,
                      done ? styles['step__line--done'] : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <span className={dotClass}>
                    {done ? (
                      <CheckCircle2 size={15} strokeWidth={2.6} aria-hidden />
                    ) : (
                      <Icon
                        size={15}
                        strokeWidth={2.2}
                        className={active && s.key === 'transcoding' ? styles.spin : undefined}
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className={styles.step__body}>
                    <span
                      className={[styles.step__label, active || done ? styles['step__label--on'] : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {s.label}
                    </span>
                    <span className={styles.step__hint}>{s.hint}</span>
                  </span>
                  {active && s.key === 'uploading' ? (
                    <span className={styles.step__pct}>{progress.percent}%</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginBottom: 28 }} />
        )}

        {/* ---------- 操作 ---------- */}
        <div className={styles.actions}>
          {stage === 'published' ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles['btn--primary']}`}
                onClick={() => navigate('/')}
              >
                <Eye size={17} strokeWidth={2} style={{ marginRight: 6 }} aria-hidden />
                查看动态
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles['btn--ghost']}`}
                onClick={() => navigate('/compose')}
              >
                再发一条
              </button>
            </>
          ) : null}

          {stage === 'rejected' ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles['btn--primary']}`}
                onClick={() => toast.show('申诉入口（Demo 未实现）')}
              >
                查看原因与申诉
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles['btn--ghost']}`}
                onClick={() => navigate('/compose')}
              >
                修改后重新发布
              </button>
            </>
          ) : null}

          {stage === 'failed' ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles['btn--primary']}`}
                onClick={() => void retry()}
              >
                <RefreshCw size={17} strokeWidth={2} style={{ marginRight: 6 }} aria-hidden />
                重试
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles['btn--ghost']}`}
                onClick={() => navigate('/')}
              >
                稍后再试
              </button>
            </>
          ) : null}

          {!isDone && !isProblem ? (
            <button
              type="button"
              className={`${styles.btn} ${styles['btn--ghost']}`}
              onClick={() => navigate('/')}
            >
              返回首页（后台继续）
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
