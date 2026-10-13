import { useState } from 'react';
import { BellOff, EyeOff, Flag, Pencil, Trash2 } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '@/components/common/ContextMenu';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ReportModal } from '@/components/report/ReportModal';
import { EditPostModal } from './EditPostModal';
import { deletePostApi } from '@/mocks/api';
import { toast } from '@/stores/toastStore';
import type { FeedItem } from '@/types/feed';

interface PostMenuProps {
  /** 菜单锚点（视口坐标）；null 表示关闭 */
  point: { x: number; y: number } | null;
  item: FeedItem | null;
  /** 是否本人发布：本人出「编辑 / 删除」，他人出「不感兴趣 / 静音 / 举报」 */
  mine: boolean;
  onClose: () => void;
  /** 编辑成功：调用方把列表里的那一条换成新内容 */
  onUpdated?: (item: FeedItem) => void;
  /** 删除 / 不感兴趣 / 屏蔽同类：调用方把它从列表里移除 */
  onRemoved?: (item: FeedItem, reason: 'deleted' | 'hidden') => void;
}

/**
 * 动态的「更多」下拉菜单
 */
export function PostMenu({
  point,
  item,
  mine,
  onClose,
  onUpdated,
  onRemoved,
}: PostMenuProps) {
  const [editing, setEditing] = useState<FeedItem | null>(null);
  const [deleting, setDeleting] = useState<FeedItem | null>(null);
  const [reportFor, setReportFor] = useState<FeedItem | null>(null);

  const items: ContextMenuItem[] = [];
  if (item) {
    if (mine) {
      items.push({
        key: 'edit',
        label: '编辑动态',
        icon: <Pencil size={16} strokeWidth={1.9} aria-hidden />,
        onSelect: () => setEditing(item),
      });
      items.push({
        key: 'delete',
        label: '删除动态',
        danger: true,
        icon: <Trash2 size={16} strokeWidth={1.9} aria-hidden />,
        onSelect: () => setDeleting(item),
      });
    } else {
      const isVideo = item.layout === 'video';
      items.push({
        key: 'hide',
        label: isVideo ? '屏蔽同类视频' : '不感兴趣',
        icon: <EyeOff size={16} strokeWidth={1.9} aria-hidden />,
        onSelect: () => {
          onRemoved?.(item, 'hidden');
          toast.show(isVideo ? '将不再推荐同类视频' : '将减少此类内容');
        },
      });
      items.push({
        key: 'mute',
        label: `静音 @${item.author.handle}`,
        icon: <BellOff size={16} strokeWidth={1.9} aria-hidden />,
        onSelect: () => toast.show(`已静音 @${item.author.handle}`),
      });
      items.push({
        key: 'report',
        label: '举报这条动态',
        danger: true,
        icon: <Flag size={16} strokeWidth={1.9} aria-hidden />,
        onSelect: () => setReportFor(item),
      });
    }
  }

  return (
    <>
      <ContextMenu
        point={point}
        items={items}
        onClose={onClose}
        ariaLabel={mine ? '我的动态操作' : '动态操作'}
      />

      {/* ---------- 编辑 ---------- */}
      {editing ? (
        <EditPostModal
          open
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => onUpdated?.(next)}
        />
      ) : null}

      {/* ---------- 删除二次确认 ---------- */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        title="删除这条动态？"
        confirmText="删除"
        description="删除后，这条动态及其下的回复都会从你的主页和信息流中消失，且无法恢复。"
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          void deletePostApi(target.content_id)
            .then(() => {
              onRemoved?.(target, 'deleted');
              toast.success('动态已删除');
            })
            .catch(() => toast.error('删除失败，请重试'));
        }}
      />

      {/* ---------- 举报 ---------- */}
      <ReportModal
        open={reportFor !== null}
        onClose={() => setReportFor(null)}
        targetLabel={reportFor ? `@${reportFor.author.handle} 的动态` : ''}
      />
    </>
  );
}
