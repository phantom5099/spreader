/**
 * 草稿箱列表项的首行文案（纯展示派生）
 */
import type { Draft } from '@/types/draft';

export function draftPreview(draft: Draft): string {
  const first = draft.text.trim().split('\n')[0]?.trim();
  if (first) return first;
  if (draft.media.length > 0) {
    return draft.media[0]!.kind === 'video' ? '[视频]' : `[${draft.media.length} 张图片]`;
  }
  return '（无内容）';
}
