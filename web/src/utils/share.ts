import { toast } from '@/stores/toastStore';

/**
 * 分享一条动态
 * Demo 用「复制链接」承担分享：真实产品这里会唤起系统分享面板，
 * 所以全站只有这一个入口，不要在各页面各写一遍。
 */
export function sharePostLink(contentId: string): void {
  void navigator.clipboard
    ?.writeText(`${window.location.origin}/post/${contentId}`)
    .then(() => toast.success('链接已复制'))
    .catch(() => toast.error('复制失败，请手动复制地址栏链接'));
}
