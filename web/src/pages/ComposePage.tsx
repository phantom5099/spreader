import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  X,
  Image as ImageIcon,
  Film,
  Smile,
  BarChart2,
  Hash,
  AtSign,
  Globe,
  Users,
  Lock,
  UserCheck,
  AlertTriangle,
  Clock,
  FileText,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { CURRENT_USER } from '@/mocks/currentUser';
import { useDraftStore, type Draft, type DraftMedia } from '@/stores/draftStore';
import { formatBytes, pickImage, pickVideo } from '@/mocks/media';
import { toast } from '@/stores/toastStore';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { VisibilityPicker } from '@/components/compose/VisibilityPicker';
import { TopicPicker } from '@/components/compose/TopicPicker';
import { MentionPicker } from '@/components/compose/MentionPicker';
import { ImageEditorModal } from '@/components/compose/ImageEditorModal';
import { DraftsModal } from '@/components/compose/DraftsModal';
import type { Visibility } from '@/types/feed';
import styles from './ComposePage.module.css';

const MAX_LENGTH = 2000;
const MAX_IMAGES = 9;
const MAX_VIDEO_MB = 50;
const MAX_VIDEO_SEC = 60;

export function ComposePage() {
  const navigate = useNavigate();
  const { draftId } = useParams();
  const [params] = useSearchParams();
  /* 注意：useSearchParams 每次渲染都返回新对象，不能直接进 effect 依赖，
     这里只取出真正会变化的字符串，作为稳定依赖。 */
  const quoteText = params.get('text');

  const refresh = useDraftStore((s) => s.refresh);
  const upsert = useDraftStore((s) => s.upsert);
  const remove = useDraftStore((s) => s.remove);
  const create = useDraftStore((s) => s.create);
  const setEditing = useDraftStore((s) => s.setEditing);
  const drafts = useDraftStore((s) => s.drafts);

  const [draft, setDraft] = useState<Draft>(() => create());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /* 浮层开关 */
  const [showVisibility, setShowVisibility] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [editingMedia, setEditingMedia] = useState<DraftMedia | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const taRef = useRef<HTMLTextAreaElement | null>(null);

  /* -------------------- 载入草稿（/compose/:draftId 或 ?quote=）-------------------- */
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (draftId) {
      const found = useDraftStore.getState().get(draftId);
      if (found) {
        setDraft(found);
        setEditing(found.id);
        return;
      }
    }

    // 引用转发：?quote=<contentId>&text=
    if (quoteText) {
      setDraft((d) => ({ ...d, text: quoteText }));
    }
  }, [draftId, quoteText, setEditing]);

  /* -------------------- 自动增高 -------------------- */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [draft.text]);

  /* -------------------- 自动存草稿 -------------------- */
  const isDirty = draft.text.trim().length > 0 || draft.media.length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const t = window.setTimeout(() => {
      upsert(draft);
      setSavedAt(Date.now());
    }, 900);
    return () => window.clearTimeout(t);
  }, [draft, isDirty, upsert]);

  /* -------------------- 关闭拦截 -------------------- */
  const attemptClose = useCallback(() => {
    if (isDirty) {
      setConfirmExit(true);
    } else {
      setEditing(null);
      navigate(-1);
    }
  }, [isDirty, navigate, setEditing]);

  const leaveWithoutSaving = () => {
    if (draft.id) remove(draft.id);
    setConfirmExit(false);
    setEditing(null);
    navigate('/');
  };

  const saveAndLeave = () => {
    upsert(draft);
    toast.success('已保存到草稿箱');
    setConfirmExit(false);
    setEditing(null);
    navigate('/');
  };

  /* -------------------- 媒体操作 -------------------- */
  const addImage = () => {
    const imageCount = draft.media.filter((m) => m.kind === 'image').length;
    if (draft.media.some((m) => m.kind === 'video')) {
      toast.error('视频与图片不能混合发布');
      return;
    }
    if (imageCount >= MAX_IMAGES) {
      toast.error(`最多 ${MAX_IMAGES} 张图片`);
      return;
    }
    setDraft((d) => ({ ...d, media: [...d.media, pickImage()] }));
  };

  const addVideo = () => {
    if (draft.media.length > 0) {
      toast.error('视频与图片不能混合发布');
      return;
    }
    const v = pickVideo();
    if ((v.duration_ms ?? 0) > MAX_VIDEO_SEC * 1000) {
      toast.error(`视频时长不能超过 ${MAX_VIDEO_SEC} 秒`);
      return;
    }
    if (v.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`视频体积不能超过 ${MAX_VIDEO_MB} MB`);
      return;
    }
    setDraft((d) => ({ ...d, media: [v] }));
  };

  const removeMedia = (id: string) => {
    setDraft((d) => ({ ...d, media: d.media.filter((m) => m.id !== id) }));
  };

  /** 拖拽排序 */
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const onDrop = (targetId: string) => {
    const from = dragIdRef.current;
    dragIdRef.current = null;
    setDragOverId(null);
    if (!from || from === targetId) return;
    setDraft((d) => {
      const list = [...d.media];
      const fi = list.findIndex((m) => m.id === from);
      const ti = list.findIndex((m) => m.id === targetId);
      if (fi < 0 || ti < 0) return d;
      const [moved] = list.splice(fi, 1);
      list.splice(ti, 0, moved!);
      return { ...d, media: list };
    });
  };

  /* -------------------- 字数 -------------------- */
  const len = draft.text.length;
  const remaining = MAX_LENGTH - len;
  const over = remaining < 0;
  const canPublish = isDirty && !over;

  const counterClass = over
    ? styles['counter--over']
    : remaining <= 100
      ? styles['counter--warn']
      : '';

  /* 字数环 */
  const ratio = Math.min(len / MAX_LENGTH, 1);
  const R = 9;
  const C = 2 * Math.PI * R;

  /* -------------------- 发布 -------------------- */
  const publish = () => {
    if (!canPublish) return;
    upsert(draft);
    setEditing(null);
    navigate(`/publishing/${draft.id}`);
  };

  /* -------------------- 可见范围图标 -------------------- */
  const VisIcon = useMemo(() => {
    switch (draft.visibility) {
      case 'followers':
        return Users;
      case 'mutual':
        return UserCheck;
      case 'specified':
        return AtSign;
      case 'private':
        return Lock;
      default:
        return Globe;
    }
  }, [draft.visibility]);

  const visLabel = useMemo(() => {
    switch (draft.visibility) {
      case 'followers':
        return '仅关注者可见';
      case 'mutual':
        return '仅互关好友可见';
      case 'specified':
        return `指定 ${draft.visibleTo.length} 人可见`;
      case 'private':
        return '仅自己可见';
      default:
        return '公开可见';
    }
  }, [draft.visibility, draft.visibleTo.length]);

  return (
    <div className={styles.compose} onClick={(e) => e.target === e.currentTarget && attemptClose()}>
      <div className={styles.compose__panel}>
        {/* ---------- 顶栏 ---------- */}
        <div className={styles.topbar}>
          <button
            type="button"
            className={styles.topbar__close}
            aria-label="关闭"
            onClick={attemptClose}
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>

          <span className={styles.topbar__title}>
            草稿{savedAt ? ' · 已自动保存' : ''}
          </span>

          <button
            type="button"
            className={styles.topbar__drafts}
            onClick={() => setShowDrafts(true)}
          >
            <FileText size={15} strokeWidth={2} aria-hidden />
            草稿箱{drafts.length > 0 ? ` ${drafts.length}` : ''}
          </button>

          <button
            type="button"
            className={styles.topbar__publish}
            disabled={!canPublish}
            onClick={publish}
          >
            发布
          </button>
        </div>

        {/* ---------- 主体 ---------- */}
        <div className={styles.body}>
          <div className={styles.row}>
            <span className={styles.row__avatar}>
              {CURRENT_USER.avatar_url ? <img src={CURRENT_USER.avatar_url} alt="" /> : null}
            </span>

            <div className={styles.row__main}>
              <button
                type="button"
                className={styles.visibilityPill}
                onClick={() => setShowVisibility(true)}
              >
                <VisIcon size={14} strokeWidth={2} aria-hidden />
                {visLabel}
              </button>

              <textarea
                ref={taRef}
                className={styles.textarea}
                placeholder="有什么新鲜事？"
                value={draft.text}
                aria-label="动态内容"
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    publish();
                  }
                }}
              />

              {/* 话题 / @提及 chips */}
              {draft.topics.length > 0 || draft.mentions.length > 0 ? (
                <div className={styles.chips}>
                  {draft.topics.map((t) => (
                    <span className={styles.chip} key={`t_${t}`}>
                      #{t}
                      <button
                        type="button"
                        className={styles.chip__x}
                        aria-label={`移除话题 ${t}`}
                        onClick={() =>
                          setDraft((d) => ({ ...d, topics: d.topics.filter((x) => x !== t) }))
                        }
                      >
                        <X size={13} strokeWidth={2.4} aria-hidden />
                      </button>
                    </span>
                  ))}
                  {draft.mentions.map((m) => (
                    <span className={styles.chip} key={`m_${m}`}>
                      @{m}
                      <button
                        type="button"
                        className={styles.chip__x}
                        aria-label={`移除提及 ${m}`}
                        onClick={() =>
                          setDraft((d) => ({ ...d, mentions: d.mentions.filter((x) => x !== m) }))
                        }
                      >
                        <X size={13} strokeWidth={2.4} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {/* 媒体预览（可拖拽排序） */}
              {draft.media.length > 0 ? (
                <div
                  className={[
                    styles.mediaGrid,
                    draft.media.length === 1
                      ? styles['mediaGrid--1']
                      : draft.media.length === 2
                        ? styles['mediaGrid--2']
                        : draft.media.length === 3
                          ? styles['mediaGrid--3']
                          : styles['mediaGrid--many'],
                  ].join(' ')}
                >
                  {draft.media.map((m) => (
                    <div
                      key={m.id}
                      className={[
                        styles.mediaCell,
                        dragIdRef.current === m.id ? styles['mediaCell--dragging'] : '',
                        dragOverId === m.id ? styles['mediaCell--dropTarget'] : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      draggable
                      onDragStart={() => {
                        dragIdRef.current = m.id;
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverId(m.id);
                      }}
                      onDragLeave={() => setDragOverId((id) => (id === m.id ? null : id))}
                      onDrop={() => onDrop(m.id)}
                    >
                      <img src={m.url} alt="" />

                      {m.kind === 'video' ? (
                        <span className={styles.mediaCell__badge}>
                          {Math.round((m.duration_ms ?? 0) / 1000)}s
                        </span>
                      ) : null}

                      {m.kind === 'image' ? (
                        <button
                          type="button"
                          className={styles.mediaCell__edit}
                          onClick={() => setEditingMedia(m)}
                        >
                          编辑
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className={styles.mediaCell__remove}
                        aria-label="移除"
                        onClick={() => removeMedia(m.id)}
                      >
                        <X size={15} strokeWidth={2.4} aria-hidden />
                      </button>

                      <span className="visually-hidden">
                        {m.name}，{formatBytes(m.size)}
                      </span>
                    </div>
                  ))}

                  {/* 继续添加（仅图片，且未达上限） */}
                  {draft.media[0]?.kind === 'image' && draft.media.length < MAX_IMAGES ? (
                    <button
                      type="button"
                      className={[styles.mediaCell, styles['mediaCell--add']].join(' ')}
                      aria-label="继续添加图片"
                      onClick={addImage}
                    >
                      <Plus size={24} strokeWidth={1.8} aria-hidden />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* ---------- 配置项 ---------- */}
              <div className={styles.options}>
                <button
                  type="button"
                  className={styles.option}
                  onClick={() => setShowVisibility(true)}
                >
                  <span className={styles.option__icon}>
                    <VisIcon size={19} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className={styles.option__label}>可见范围</span>
                  <span className={styles.option__value}>
                    {visLabel}
                    <ChevronRight size={16} strokeWidth={2} aria-hidden />
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.option}
                  onClick={() => setDraft((d) => ({ ...d, sensitive: !d.sensitive }))}
                  aria-pressed={draft.sensitive}
                >
                  <span className={styles.option__icon}>
                    <AlertTriangle size={19} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className={styles.option__label}>标记为敏感内容</span>
                  <span
                    className={[styles.switch, draft.sensitive ? styles['switch--on'] : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={styles.switch__knob} />
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.option}
                  onClick={() => setDraft((d) => ({ ...d, ephemeral: !d.ephemeral }))}
                  aria-pressed={draft.ephemeral}
                >
                  <span className={styles.option__icon}>
                    <Clock size={19} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className={styles.option__label}>24 小时后消失</span>
                  <span
                    className={[styles.switch, draft.ephemeral ? styles['switch--on'] : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={styles.switch__knob} />
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.option}
                  onClick={() => setShowTopics(true)}
                >
                  <span className={styles.option__icon}>
                    <Hash size={19} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className={styles.option__label}>添加话题</span>
                  <span className={styles.option__value}>
                    {draft.topics.length > 0 ? `已选 ${draft.topics.length}` : ''}
                    <ChevronRight size={16} strokeWidth={2} aria-hidden />
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.option}
                  onClick={() => setShowMentions(true)}
                >
                  <span className={styles.option__icon}>
                    <AtSign size={19} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className={styles.option__label}>提及某人</span>
                  <span className={styles.option__value}>
                    {draft.mentions.length > 0 ? `已选 ${draft.mentions.length}` : ''}
                    <ChevronRight size={16} strokeWidth={2} aria-hidden />
                  </span>
                </button>
              </div>

              <p className={styles.hint}>
                敏感内容会被加上遮罩，浏览者需主动点击才会显示。标记为敏感不影响推荐分发。
              </p>
            </div>
          </div>
        </div>

        {/* ---------- 底部工具栏 ---------- */}
        <div className={styles.toolbar}>
          <div className={styles.toolbar__tools}>
            <button
              type="button"
              className={styles.tool}
              aria-label="添加图片"
              onClick={addImage}
            >
              <ImageIcon size={20} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.tool}
              aria-label="添加视频"
              onClick={addVideo}
            >
              <Film size={20} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              className={[styles.tool, styles['tool--muted']].join(' ')}
              aria-label="添加投票（暂未开放）"
              title="投票 · 暂未开放"
            >
              <BarChart2 size={20} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              type="button"
              className={[styles.tool, styles['tool--muted']].join(' ')}
              aria-label="添加表情（暂未开放）"
              title="表情 · 暂未开放"
            >
              <Smile size={20} strokeWidth={1.9} aria-hidden />
            </button>
          </div>

          <span className={[styles.counter, counterClass].filter(Boolean).join(' ')}>
            {remaining <= 100 ? (
              <>
                <svg className={styles.counter__ring} width={22} height={22} aria-hidden>
                  <circle
                    cx={11}
                    cy={11}
                    r={R}
                    fill="none"
                    stroke="var(--border-strong)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={11}
                    cy={11}
                    r={R}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - ratio)}
                  />
                </svg>
                <span>{remaining}</span>
              </>
            ) : null}
          </span>
        </div>
      </div>

      {/* ---------- 各类模态层 ---------- */}
      <VisibilityPicker
        open={showVisibility}
        value={draft.visibility}
        visibleTo={draft.visibleTo}
        onChange={(v: Visibility, ids: string[]) =>
          setDraft((d) => ({ ...d, visibility: v, visibleTo: ids }))
        }
        onClose={() => setShowVisibility(false)}
      />

      <TopicPicker
        open={showTopics}
        selected={draft.topics}
        onChange={(topics) => setDraft((d) => ({ ...d, topics }))}
        onClose={() => setShowTopics(false)}
      />

      <MentionPicker
        open={showMentions}
        selected={draft.mentions}
        onChange={(mentions) => setDraft((d) => ({ ...d, mentions }))}
        onClose={() => setShowMentions(false)}
      />

      <ImageEditorModal
        open={editingMedia !== null}
        media={editingMedia}
        onClose={() => setEditingMedia(null)}
        onSave={(edited) => {
          setDraft((d) => ({
            ...d,
            media: d.media.map((m) => (m.id === edited.id ? edited : m)),
          }));
          setEditingMedia(null);
          toast.success('图片已更新');
        }}
      />

      <DraftsModal
        open={showDrafts}
        drafts={drafts}
        currentId={draft.id}
        onOpen={(d) => {
          upsert(draft);
          setDraft(d);
          setShowDrafts(false);
        }}
        onDelete={(id) => {
          remove(id);
          toast.success('草稿已删除');
        }}
        onClose={() => setShowDrafts(false)}
      />

      <ConfirmDialog
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="保存这条草稿吗？"
        description="你编辑的内容还没有保存。保存后可以从草稿箱继续编辑。"
        confirmText="保存草稿"
        cancelText="继续编辑"
        danger
        onConfirm={saveAndLeave}
        tertiary={{ text: '不保存', onClick: leaveWithoutSaving }}
      />
    </div>
  );
}
