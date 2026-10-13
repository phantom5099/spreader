import { Link, useLocation } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { shellStyles } from './AppShell';

/** 窄屏右下角悬浮发帖按钮（sm 档显示，见 AppShell.module.css） */
export function ComposeFab() {
  const location = useLocation();

  return (
    <Link
      to="/compose"
      state={{ background: location }}
      className={shellStyles.shell__fab}
      aria-label="发帖"
    >
      <PenLine size={24} strokeWidth={2.2} aria-hidden />
    </Link>
  );
}
