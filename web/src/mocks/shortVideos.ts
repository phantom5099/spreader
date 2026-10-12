/**
 * 短视频数据
 *
 * 复用信息流里的视频条目（作者、互动数、发布时间一致，点进回复能看到同一条动态），
 * 另配一套竖屏封面与文案 —— 竖屏是这一页的版式前提，横屏封面会把整屏撑成横幅。
 */
import type { FeedItem } from '@/types/feed';
import { ALL_FEED_ITEMS } from './feed';
import { motionPlaceholder } from './placeholders';

/** 竖屏封面尺寸 */
const REEL_W = 1080;
const REEL_H = 1920;

/** 短视频文案池：比信息流的通用文案更贴近"一段画面"的语气 */
const CAPTIONS = [
  '把今天的光留下来了。',
  '街头随拍，没有剧本。',
  '这段拍了三遍才满意。',
  '随手记录的一分钟。',
  '天快黑的时候最好看。',
  '声音是现场的，画质是手机的。',
  '镜头晃了一下，但舍不得剪。',
  '没人催我，就慢慢拍了十分钟。',
  '路过的时候觉得非拍不可。',
  '一直在等那班车过去。',
];

export const SHORT_VIDEOS: FeedItem[] = ALL_FEED_ITEMS.filter(
  (item) => item.layout === 'video' && item.status === 'published' && item.media.length > 0,
).map((item, index) => {
  const poster = motionPlaceholder(`${item.content_id}_v`, REEL_W, REEL_H);

  return {
    ...item,
    text: CAPTIONS[index % CAPTIONS.length]!,
    media: [{ url: poster, cover_url: poster, width: REEL_W, height: REEL_H }],
  };
});
