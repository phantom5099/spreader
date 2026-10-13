import { useEffect, useRef, useState } from 'react';
import { Image, Smile, X, Send } from 'lucide-react';
import { CURRENT_USER } from '@/mocks/currentUser';
import styles from './CommentComposer.module.css';

interface CommentComposerProps {
  /** 正在回复的对象（显示提示条） */
  replyingTo?: { handle: string; name: string } | null;
  onCancelReply?: () => void;
  onSubmit?: (text: string) => void;
  placeholder?: string;
  /** 字数上限 */
  maxLength?: number;
}

/**
 * 评论输入框（吸底）
 * 规格：textarea 自动增高（最高 160px）；剩余 100 字转橙、超限转红并禁用发送。
 */
export function CommentComposer({
  replyingTo,
  onCancelReply,
  onSubmit,
  placeholder = '发布你的回复',
  maxLength = 2000,
}: CommentComposerProps) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自动增高
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  // 切换回复对象时聚焦
  useEffect(() => {
    if (replyingTo) taRef.current?.focus();
  }, [replyingTo]);

  const remaining = maxLength - text.length;
  const over = remaining < 0;
  const canSend = text.trim().length > 0 && !over;

  const submit = () => {
    if (!canSend) return;
    onSubmit?.(text.trim());
    setText('');
    onCancelReply?.();
  };

  const counterClass = over
    ? styles['composer__counter--over']
    : remaining <= 100
      ? styles['composer__counter--warn']
      : '';

  return (
    <>
      {replyingTo ? (
        <div className={styles.composer__replying}>
          <span>
            正在回复 <span className={styles.composer__replyingName}>@{replyingTo.handle}</span>
          </span>
          <button
            type="button"
            className={styles.composer__replyingClose}
            aria-label="取消回复"
            onClick={onCancelReply}
          >
            <X size={15} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className={styles.composer}>
        <span className={styles.composer__avatar}>
          {CURRENT_USER.avatar_url ? <img src={CURRENT_USER.avatar_url} alt="" /> : null}
        </span>

        <div className={styles.composer__field}>
          <textarea
            ref={taRef}
            className={styles.composer__textarea}
            rows={1}
            value={text}
            placeholder={replyingTo ? `回复 @${replyingTo.handle}` : placeholder}
            aria-label="评论内容"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className={styles.composer__tools}>
            <button type="button" className={styles.composer__tool} aria-label="添加图片">
              <Image size={18} strokeWidth={1.9} aria-hidden />
            </button>
            <button type="button" className={styles.composer__tool} aria-label="添加表情">
              <Smile size={18} strokeWidth={1.9} aria-hidden />
            </button>
          </div>
        </div>

        {text.length > 0 && (remaining <= 100 || over) ? (
          <span className={[styles.composer__counter, counterClass].filter(Boolean).join(' ')}>
            {remaining}
          </span>
        ) : null}

        {text.length > 0 ? (
          <button
            type="button"
            className={styles.composer__send}
            disabled={!canSend}
            onClick={submit}
            aria-label="发送回复"
          >
            <Send size={16} strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
      </div>
    </>
  );
}
