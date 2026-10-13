import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

export function NotFoundPage() {
  return (
    <AppShell>
      <div style={{ padding: '96px 32px', textAlign: 'center' }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 56,
            height: 56,
            margin: '0 auto 16px',
            borderRadius: 9999,
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
        >
          <Compass size={26} strokeWidth={1.75} aria-hidden />
        </span>
        <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, marginBottom: 8 }}>页面不存在</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 20 }}>
          你访问的地址可能已被删除，或者从来没有存在过。
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            height: 38,
            padding: '0 20px',
            borderRadius: 9999,
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 'var(--font-sm)',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          回到首页
        </Link>
      </div>
    </AppShell>
  );
}
