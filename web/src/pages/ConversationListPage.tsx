import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, Pin, Search, SquarePen, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ConversationRow } from '@/components/message/ConversationRow';
import { NewGroupModal } from '@/components/message/NewGroupModal';
import { useConversationStore } from '@/stores/conversationStore';
import styles from './ConversationListPage.module.css';

/**
 * 会话列表页（消息组）
 * `[头像 48] 名称 · 时间 | 最后一条消息预览 | 未读红点`
 */
export function ConversationListPage() {
  const navigate = useNavigate();
  const list = useConversationStore((s) => s.list);

  const [query, setQuery] = useState('');
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const { pinned, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (c) =>
            c.title.toLowerCase().includes(q) || c.last_message.toLowerCase().includes(q),
        )
      : list;
    return {
      pinned: filtered.filter((c) => c.pinned),
      rest: filtered.filter((c) => !c.pinned),
    };
  }, [list, query]);

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          {/* 搜索 + 发起新会话 */}
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <span className={styles.searchWrap__icon}>
                <Search size={17} strokeWidth={2} aria-hidden />
              </span>
              <input
                className={styles.searchWrap__input}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索会话"
                aria-label="搜索会话"
              />
              {query ? (
                <button
                  type="button"
                  className={styles.searchWrap__clear}
                  aria-label="清空搜索"
                  onClick={() => setQuery('')}
                >
                  <X size={16} strokeWidth={2.2} aria-hidden />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className={styles.newBtn}
              aria-label="发起新会话"
              title="发起新会话"
              onClick={() => setNewGroupOpen(true)}
            >
              <SquarePen size={19} strokeWidth={2} aria-hidden />
            </button>
          </div>

          {/* 列表 */}
          {list.length === 0 ? (
            <div className={styles.empty}>
              <SquarePen size={26} strokeWidth={1.6} aria-hidden />
              <h2 className={styles.empty__title}>还没有会话</h2>
              <p className={styles.empty__desc}>点搜索框右侧的按钮发起一个单聊或群聊。</p>
            </div>
          ) : pinned.length === 0 && rest.length === 0 ? (
            <div className={styles.empty}>
              <Search size={26} strokeWidth={1.6} aria-hidden />
              <h2 className={styles.empty__title}>没有匹配的会话</h2>
              <p className={styles.empty__desc}>换个关键词试试。</p>
              <button type="button" className={styles.empty__btn} onClick={() => setQuery('')}>
                清空搜索
              </button>
            </div>
          ) : (
            <>
              {pinned.length > 0 ? (
                <>
                  <div className={styles.sectionHead}>
                    <Pin size={14} strokeWidth={2.2} aria-hidden />
                    置顶
                  </div>
                  {pinned.map((c) => (
                    <ConversationRow
                      key={c.conversation_id}
                      conversation={c}
                      onClick={() => navigate(`/messages/${c.conversation_id}`)}
                    />
                  ))}
                </>
              ) : null}

              {rest.length > 0 ? (
                <>
                  {pinned.length > 0 ? (
                    <div className={styles.sectionHead}>
                      <BellOff size={14} strokeWidth={2.2} aria-hidden />
                      全部会话
                    </div>
                  ) : null}
                  {rest.map((c) => (
                    <ConversationRow
                      key={c.conversation_id}
                      conversation={c}
                      onClick={() => navigate(`/messages/${c.conversation_id}`)}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}

          <div className={styles.tail} />
        </div>
      </div>

      <NewGroupModal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        onCreated={(id) => navigate(`/messages/${id}`)}
      />
    </AppShell>
  );
}
