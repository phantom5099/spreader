import { AppShell } from '@/components/layout/AppShell';
import { PostCardSkeleton } from '@/components/post/PostCardSkeleton';

/**
 * 路由级加载兜底
 * 懒加载页面切换时不留白屏，用与信息流同构的骨架屏占位，
 * 这样从任一入口进入都不会出现"闪一下空白"的观感。
 */
export function RouteFallback() {
  return (
    <AppShell>
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <div style={{ width: '100%', maxWidth: 600, paddingTop: 4 }}>
          <PostCardSkeleton count={5} withMedia={false} />
        </div>
      </div>
    </AppShell>
  );
}
