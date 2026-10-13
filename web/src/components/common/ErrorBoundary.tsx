import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界
 * 任何渲染期异常都不应白屏，给一个可恢复的兜底界面。
 * 只捕获渲染/lifecycle 异常；事件回调里的异常由各页面的 try/catch 兜住。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* Demo：保留到控制台，方便走查时定位；生产可替换为上报 */
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.href = '/';
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className={styles.page} role="alert">
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden>
            <TriangleAlert size={28} strokeWidth={1.75} />
          </span>
          <h1 className={styles.title}>页面出了点问题</h1>
          <p className={styles.desc}>
            渲染这个页面时遇到了意外错误，你的数据没有丢失。
            可以尝试重试，或回到信息流继续浏览。
          </p>

          <pre className={styles.detail}>{error.message}</pre>

          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={this.reload}>
              <RotateCcw size={16} strokeWidth={2.2} aria-hidden />
              回到信息流
            </button>
            <button type="button" className={styles.btnGhost} onClick={this.reset}>
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }
}
