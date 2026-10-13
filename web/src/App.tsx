import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FeedPage } from '@/pages/FeedPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteFallback } from '@/components/common/RouteFallback';
import { Toaster } from '@/components/common/Toaster';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { RequireAuth } from '@/components/common/RequireAuth';
import { CURRENT_USER } from '@/mocks/currentUser';

/* --------------------------------------------------------------------------
 * 按路由分包
 * 首屏只加载信息流（FeedPage 静态引入），
 * 其余页面全部 lazy —— 压小首包，各页面之间也互不拖累。
 * -------------------------------------------------------------------------- */

const PostDetailPage = lazy(() =>
  import('@/pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })),
);
const ComposePage = lazy(() =>
  import('@/pages/ComposePage').then((m) => ({ default: m.ComposePage })),
);
const PublishingPage = lazy(() =>
  import('@/pages/PublishingPage').then((m) => ({ default: m.PublishingPage })),
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const FollowingListPage = lazy(() =>
  import('@/pages/FollowListPage').then((m) => ({ default: m.FollowingListPage })),
);
const FollowersListPage = lazy(() =>
  import('@/pages/FollowListPage').then((m) => ({ default: m.FollowersListPage })),
);
const ListManagerPage = lazy(() =>
  import('@/pages/ListManagerPage').then((m) => ({ default: m.ListManagerPage })),
);
const ConversationListPage = lazy(() =>
  import('@/pages/ConversationListPage').then((m) => ({ default: m.ConversationListPage })),
);
const ChatThreadPage = lazy(() =>
  import('@/pages/ChatThreadPage').then((m) => ({ default: m.ChatThreadPage })),
);
const NotificationPage = lazy(() =>
  import('@/pages/NotificationPage').then((m) => ({ default: m.NotificationPage })),
);
const SearchPage = lazy(() =>
  import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const VideosPage = lazy(() =>
  import('@/pages/VideosPage').then((m) => ({ default: m.VideosPage })),
);
const TopicPage = lazy(() =>
  import('@/pages/TopicPage').then((m) => ({ default: m.TopicPage })),
);
const TopicsPage = lazy(() =>
  import('@/pages/TopicsPage').then((m) => ({ default: m.TopicsPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SettingsDisplayPage = lazy(() =>
  import('@/pages/SettingsDisplayPage').then((m) => ({ default: m.SettingsDisplayPage })),
);
const SettingsAccountPage = lazy(() =>
  import('@/pages/SettingsSubPages').then((m) => ({ default: m.SettingsAccountPage })),
);
const SettingsPreferencesPage = lazy(() =>
  import('@/pages/SettingsSubPages').then((m) => ({ default: m.SettingsPreferencesPage })),
);
const SettingsNotificationsPage = lazy(() =>
  import('@/pages/SettingsSubPages').then((m) => ({ default: m.SettingsNotificationsPage })),
);
const SettingsPrivacyPage = lazy(() =>
  import('@/pages/SettingsSubPages').then((m) => ({ default: m.SettingsPrivacyPage })),
);
const SettingsTagsPage = lazy(() =>
  import('@/pages/SettingsSubPages').then((m) => ({ default: m.SettingsTagsPage })),
);
const SettingsDeactivatePage = lazy(() =>
  import('@/pages/SettingsSubPages').then((m) => ({ default: m.SettingsDeactivatePage })),
);
const SettingsAboutPage = lazy(() =>
  import('@/pages/SettingsAboutPage').then((m) => ({ default: m.SettingsAboutPage })),
);
const SettingsReportsPage = lazy(() =>
  import('@/pages/SettingsAboutPage').then((m) => ({ default: m.SettingsReportsPage })),
);
const BookmarksPage = lazy(() =>
  import('@/pages/BookmarksPage').then((m) => ({ default: m.BookmarksPage })),
);
const QuoteComposePage = lazy(() =>
  import('@/pages/QuoteComposePage').then((m) => ({ default: m.QuoteComposePage })),
);
const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const SignupProfilePage = lazy(() =>
  import('@/pages/SignupProfilePage').then((m) => ({ default: m.SignupProfilePage })),
);

export default function App() {
  const location = useLocation();
  const background = (
    location.state as { background?: ReturnType<typeof useLocation> } | null
  )?.background;

  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <RequireAuth>
        <Routes location={background ?? location}>
          {/* 首屏：信息流（静态引入，不做懒加载） */}
          <Route path="/" element={<FeedPage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />

          {/* 详情 */}
          <Route path="/post/:contentId" element={<PostDetailPage />} />

          {/* 发布流程（无背景时作为独立页兜底） */}
          {!background ? <Route path="/compose" element={<ComposePage />} /> : null}
          {!background ? <Route path="/compose/:draftId" element={<ComposePage />} /> : null}
          <Route path="/compose/quote/:contentId" element={<QuoteComposePage />} />
          <Route path="/quote/:contentId" element={<QuoteComposePage />} />
          <Route path="/publishing/:draftId" element={<PublishingPage />} />

          {/* 关系与主页组 */}
          <Route path="/me" element={<Navigate to={`/u/${CURRENT_USER.handle}`} replace />} />
          <Route path="/u/:handle" element={<ProfilePage />} />
          <Route path="/u/:handle/following" element={<FollowingListPage />} />
          <Route path="/u/:handle/followers" element={<FollowersListPage />} />
          <Route path="/settings/lists" element={<ListManagerPage />} />
          <Route path="/settings/lists/:tab" element={<ListManagerPage />} />

          {/* 消息组 + 通知中心 */}
          <Route path="/messages" element={<ConversationListPage />} />
          <Route path="/messages/:conversationId" element={<ChatThreadPage />} />
          <Route path="/notifications" element={<NotificationPage />} />

          {/* 短视频 */}
          <Route path="/videos" element={<VideosPage />} />

          {/* 搜索 / 话题 / 收藏 */}
          <Route path="/search" element={<SearchPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/topic/:topic" element={<TopicPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />

          {/* 设置全套 */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/account" element={<SettingsAccountPage />} />
          <Route path="/settings/preferences" element={<SettingsPreferencesPage />} />
          <Route path="/settings/notifications" element={<SettingsNotificationsPage />} />
          <Route path="/settings/display" element={<SettingsDisplayPage />} />
          <Route path="/settings/privacy" element={<SettingsPrivacyPage />} />
          <Route path="/settings/tags" element={<SettingsTagsPage />} />
          <Route path="/settings/deactivate" element={<SettingsDeactivatePage />} />
          <Route path="/settings/about" element={<SettingsAboutPage />} />
          <Route path="/settings/licenses" element={<SettingsAboutPage />} />
          <Route path="/settings/reports" element={<SettingsReportsPage />} />

          {/* 登录组 */}
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<LoginPage initialMode="signup" />} />
          <Route path="/signup/profile" element={<SignupProfilePage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        {/* 浮层式发布页：叠在背景路由之上渲染 */}
        {background ? (
          <Routes>
            <Route path="/compose" element={<ComposePage />} />
            <Route path="/compose/:draftId" element={<ComposePage />} />
          </Routes>
        ) : null}
        </RequireAuth>
      </Suspense>

      <Toaster />
    </ErrorBoundary>
  );
}
