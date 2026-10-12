import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Quote } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { toast } from '@/stores/toastStore';
import { fetchItem } from '@/mocks/api';
import { CURRENT_USER } from '@/mocks/currentUser';
import { formatRelativeTime } from '@/utils/format';
import type { FeedItem } from '@/types/feed';
import styles from './QuoteComposePage.module.css';

const MAX_LENGTH = 2000;

/**
 * 引用转发编辑页（主流程 1）
 */
export function QuoteComposePage() {
  const { contentId = '' } = useParams();
  const navigate = useNavigate();

  const [source, setSource] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    void fetchItem(contentId).then((data) => {
      if (!alive) return;
      setSource(data);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [contentId]);

  /* 自动增高 */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const canSubmit = text.trim().length > 0 && text.length <= MAX_LENGTH && !submitting;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    setSubmitting(true);
    /* Demo：直接成功并回到信息流，由 toast 给出反馈 */
    window.setTimeout(() => {
      toast.success('已引用转发');
      setSubmitting(false);
      navigate('/');
    }, 620);
  }, [canSubmit, navigate]);

  if (loading) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <header className={styles.bar}>
              <button type="button" className={styles.bar__icon} aria-label="关闭" onClick={() => navigate(-1)}>
                <ArrowLeft size={20} strokeWidth={2} aria-hidden />
              </button>
              <span className={styles.bar__title}>引用转发</span>
            </header>
            <div className={styles.loading}>
              <span className="skeleton-shimmer" style={{ height: 92, borderRadius: 12 }} />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!source) {
    return (
      <AppShell>
        <div className={styles.page}>
          <div className={styles.page__main}>
            <header className={styles.bar}>
              <button type="button" className={styles.bar__icon} aria-label="返回" onClick={() => navigate(-1)}>
                <ArrowLeft size={20} strokeWidth={2} aria-hidden />
              </button>
              <span className={styles.bar__title}>引用转发</span>
            </header>
            <div className={styles.missing}>
              <Quote size={26} strokeWidth={1.6} aria-hidden />
              <h2 className={styles.missing__title}>原动态不可用</h2>
              <p className={styles.missing__desc}>
                这条动态可能已被删除，无法引用转发。
              </p>
              <button type="button" className={styles.missing__btn} onClick={() => navigate('/')}>
                回到信息流
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const over = text.length > MAX_LENGTH;
  const remain = MAX_LENGTH - text.length;

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* ---------- 顶栏 ---------- */}
          <header className={styles.bar}>
            <button
              type="button"
              className={styles.bar__icon}
              aria-label="关闭"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
            </button>
            <span className={styles.bar__title}>引用转发</span>
            <button
              type="button"
              className={styles.bar__submit}
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? '发布中…' : '发布'}
            </button>
          </header>

          <div className={styles.editor}>
            {/* 当前用户行 */}
            <div className={styles.editor__me}>
              <span className={styles.editor__avatar}>
                <img src={CURRENT_USER.avatar_url} alt="" />
              </span>
              <span className={styles.editor__name}>{CURRENT_USER.nickname}</span>
            </div>

            {/* 正文输入 */}
            <textarea
              ref={textareaRef}
              className={styles.editor__textarea}
              value={text}
              autoFocus
              placeholder="说点什么…（可选）"
              aria-label="引用转发的正文"
              onChange={(e) => setText(e.target.value)}
            />

            {/* 原帖引用卡片 */}
            <div className={styles.quoted}>
              <div className={styles.quoted__head}>
                <span className={styles.quoted__avatar}>
                  <img src={source.author.avatar_url} alt="" />
                </span>
                <span className={styles.quoted__name}>{source.author.nickname}</span>
                <span className={styles.quoted__handle}>
                  @{source.author.handle} · {formatRelativeTime(source.published_at)}
                </span>
              </div>

              {source.status_reason === 'deleted' ? (
                <div className={styles.quoted__missing}>内容不可用（原动态已被删除）</div>
              ) : (
                <>
                  {source.text ? <div className={styles.quoted__text}>{source.text}</div> : null}
                  {source.media.length > 0 ? (
                    <div className={styles.quoted__media}>
                      <img src={source.media[0]!.cover_url} alt="" loading="lazy" />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* ---------- 底部工具条 ---------- */}
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.toolbar__icon}
              aria-label="添加图片"
              title="引用转发不支持再添加媒体"
              onClick={() => toast.show('引用转发不支持在此处再添加媒体')}
            >
              <ImagePlus size={20} strokeWidth={1.9} aria-hidden />
            </button>

            <div className={styles.toolbar__spacer} />

            {text.length > 0 ? (
              <div className={styles.counter} aria-label={`还可输入 ${remain} 字`}>
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
                  <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border)" strokeWidth="2" />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke={over ? 'var(--danger)' : remain <= 100 ? 'var(--warning)' : 'var(--accent)'}
                    strokeWidth="2"
                    strokeDasharray={`${2 * Math.PI * 9}`}
                    strokeDashoffset={`${2 * Math.PI * 9 * (1 - Math.min(1, text.length / MAX_LENGTH))}`}
                    strokeLinecap="round"
                    transform="rotate(-90 12 12)"
                    style={{ transition: 'stroke-dashoffset 160ms ease' }}
                  />
                </svg>
                {remain <= 100 ? (
                  <span
                    className={[styles.counter__num, over ? styles['counter__num--over'] : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {remain}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {over ? (
            <p className={styles.overHint}>
              已超出 {Math.abs(remain)} 个字，请精简后再发布。
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
