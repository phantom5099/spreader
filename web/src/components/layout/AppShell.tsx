import type { ReactNode } from 'react';
import { Rail } from './Rail';
import { BottomTabBar } from './BottomTabBar';
import { ComposeFab } from './ComposeFab';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  aside?: ReactNode;
}

/**
 * 应用外壳：左导航 + 主列 + 右栏 + 窄屏底部 Tab
 */
export function AppShell({ children, aside }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <div
        className={[
          styles.shell__inner,
          aside ? styles['shell__inner--withAside'] : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <aside className={styles.shell__rail} aria-label="主导航">
          <Rail />
        </aside>

        <main className={styles.shell__main} id="main-content">
          {children}
        </main>

        {aside ? (
          <aside className={styles.shell__aside} aria-label="侧边栏">
            {aside}
          </aside>
        ) : null}
      </div>

      <BottomTabBar />
      <ComposeFab />
    </div>
  );
}

export { styles as shellStyles };
