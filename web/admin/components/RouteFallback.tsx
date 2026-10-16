import s from './RouteFallback.module.css';

/** 懒加载 / 登录态校验期间的占位 */
export function RouteFallback() {
  return (
    <div className={s.fallback} role="status">
      <div className={s.spinner} aria-hidden="true" />
      <p className={s.text}>加载中…</p>
    </div>
  );
}
