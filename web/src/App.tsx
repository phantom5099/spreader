import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
const TopicPage = lazy(() =>
  import('@/pages/TopicPage').then((m) => ({ default: m.TopicPage })),
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

/**
 * 路由表
 * 所有页面均为真实实现，无占位页。
 *
 * 发布页 / 发布状态页刻意不套 AppShell —— 它们是沉浸式流程，
 * 用全屏呈现（宽屏为居中浮层），避免导航干扰。
 */
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <RequireAuth>
        <Routes>
          {/* 首屏：信息流（静态引入，不做懒加载） */}
          <Route path="/" element={<FeedPage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />

          {/* 详情 */}
          <Route path="/post/:contentId" element={<PostDetailPage />} />

          {/* 发布流程 */}
          <Route path="/compose" element={<ComposePage />} />
          <Route path="/compose/:draftId" element={<ComposePage />} />
          <Route path="/compose/quote/:contentId" element={<QuoteComposePage />} />
          <Route path="/quote/:contentId" element={<QuoteComposePage />} />
          <Route path="/publishing/:draftId" element={<PublishingPage />} />

          {/* 关系与主页组 */}
          <Route path="/me" element={<Navigate to={`/u/${CURRENT_USER.handle}`} replace />} />
          <Route path="/u/:handle" element={<ProfilePage />} />
          <Route path="/u/:handle/following" element={<FollowingListPage />} />
          <Route path="/u/:handle/followers" element={<FollowersListPage />} />
          <Route path="/people" element={<FollowListPageRedirect />} />
          <Route path="/settings/lists" element={<ListManagerPage />} />
          <Route path="/settings/lists/:tab" element={<ListManagerPage />} />

          {/* 消息组 + 通知中心 */}
          <Route path="/messages" element={<ConversationListPage />} />
          <Route path="/messages/:conversationId" element={<ChatThreadPage />} />
          <Route path="/notifications" element={<NotificationPage />} />

          {/* 搜索 / 话题 / 收藏 */}
          <Route path="/explore" element={<SearchPage />} />
          <Route path="/search" element={<SearchPage />} />
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
        </RequireAuth>
      </Suspense>

      <Toaster />
    </ErrorBoundary>
  );
}

/** 「联系人」入口落到自己的关注列表，避免占位页 */
function FollowListPageRedirect() {
  return <Navigate to={`/u/${CURRENT_USER.handle}/following`} replace />;
}
