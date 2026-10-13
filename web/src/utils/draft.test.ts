import { describe, expect, it } from 'vitest';

import type { Draft, DraftMedia } from '@/types/draft';
import { draftPreview } from '@/utils/draft';

function makeMedia(kind: 'image' | 'video', id: string): DraftMedia {
  return { id, kind, url: 'data:,', name: 'x.png', size: 1, width: 1, height: 1 };
}

function makeDraft(partial: Partial<Draft> = {}): Draft {
  return {
    id: 'd1',
    text: '',
    media: [],
    visibility: 'public',
    visibleTo: [],
    sensitive: false,
    ephemeral: false,
    topics: [],
    mentions: [],
    updatedAt: 0,
    ...partial,
  };
}

describe('draftPreview', () => {
  it('有文字时取首个非空行并去掉首尾空白', () => {
    expect(draftPreview(makeDraft({ text: '第一条\n第二条' }))).toBe('第一条');
    expect(draftPreview(makeDraft({ text: '  前后有空格  ' }))).toBe('前后有空格');
  });

  it('先 trim 再切分，所以前导空行会被吃掉', () => {
    expect(draftPreview(makeDraft({ text: '\n\n正文在后面' }))).toBe('正文在后面');
    expect(draftPreview(makeDraft({ text: 'abc\n\n第二段' }))).toBe('abc');
  });

  it('整段空白才继续看媒体', () => {
    expect(draftPreview(makeDraft({ text: '   \n  ' }))).toBe('（无内容）');
    expect(
      draftPreview(makeDraft({ text: '   \n', media: [makeMedia('image', 'a')] })),
    ).toBe('[1 张图片]');
  });

  it('无文字无媒体时给出占位文案', () => {
    expect(draftPreview(makeDraft())).toBe('（无内容）');
    expect(draftPreview(makeDraft({ text: '   ' }))).toBe('（无内容）');
  });

  it('只有视频时显示视频标记', () => {
    expect(draftPreview(makeDraft({ media: [makeMedia('video', 'v1')] }))).toBe('[视频]');
  });

  it('图片按数量显示张数', () => {
    expect(draftPreview(makeDraft({ media: [makeMedia('image', 'a')] }))).toBe('[1 张图片]');
    expect(
      draftPreview(makeDraft({ media: [makeMedia('image', 'a'), makeMedia('image', 'b')] })),
    ).toBe('[2 张图片]');
  });

  it('媒体顺序以第一个为准', () => {
    expect(
      draftPreview(makeDraft({ media: [makeMedia('video', 'v1'), makeMedia('image', 'a')] })),
    ).toBe('[视频]');
  });
});
