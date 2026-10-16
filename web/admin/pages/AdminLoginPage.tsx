import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Field, TextInput } from '@admin/components/FormControls';
import { useAdminSessionStore } from '@admin/stores/adminSessionStore';
import { toast } from '@admin/stores/toastStore';
import s from './AdminLoginPage.module.css';

/**
 * PG-24 管理端登录
 *
 * 边界（PRD 8.11.1）：
 * - 独立入口 /admin/login，独立账号体系，用户端账号不得登录（AC-2）
 * - 本期单一超级管理员，无角色与权限分级
 * - 连续密码错误达到上限触发锁定（AC-3；次数与时长待 Q-12 定档）
 * - 未认证时不渲染任何后台数据
 */
export function AdminLoginPage() {
  const admin = useAdminSessionStore((st) => st.admin);
  const ready = useAdminSessionStore((st) => st.ready);
  const signIn = useAdminSessionStore((st) => st.signIn);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && admin) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(account, password);
    setSubmitting(false);

    if (result.ok) {
      toast('登录成功，欢迎回来');
      navigate(from, { replace: true });
      return;
    }

    switch (result.error) {
      case 'locked':
        setError(
          `连续密码错误已达上限，账号已锁定至 ${
            result.locked_until
              ? new Date(result.locked_until).toLocaleTimeString('zh-CN', { hour12: false })
              : '稍后'
          }`,
        );
        break;
      case 'user_side_account':
        setError('该账号属于用户端账号体系，不能登录管理后台');
        break;
      case 'disabled':
        setError('账号已停用，请联系系统管理员');
        break;
      default:
        setError(
          `账号或密码不正确${
            result.attempts_left != null ? `（还可尝试 ${result.attempts_left} 次）` : ''
          }`,
        );
    }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.brand}>
          <span className={s.brandDot} aria-hidden="true" />
          <span className={s.brandName}>spreader 管理后台</span>
        </div>
        <h1 className={s.title}>管理端登录</h1>
        <p className={s.subtitle}>独立账号体系 · 仅对管理员开放</p>

        {error ? (
          <div className={s.error} role="alert">
            {error}
          </div>
        ) : null}

        <form className={s.form} onSubmit={onSubmit} noValidate>
          <Field label="管理员账号" required>
            <TextInput
              value={account}
              onChange={setAccount}
              placeholder="请输入管理员账号"
              autoComplete="username"
              name="account"
            />
          </Field>

          <Field label="密码" required>
            <div className={s.passwordWrap}>
              <TextInput
                value={password}
                onChange={setPassword}
                type={showPassword ? 'text' : 'password'}
                placeholder="请输入密码"
                autoComplete="current-password"
                name="password"
              />
              <button
                type="button"
                className={s.eye}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <Button type="submit" variant="primary" block loading={submitting}>
            登 录
          </Button>
        </form>

        <div className={s.demoHint}>
          <p className={s.demoTitle}>演示说明</p>
          <ul>
            <li>演示账号：admin / spreader2026</li>
            <li>用户端账号（如 zhixia、13800000000）不能登录本后台</li>
            <li>连续输错 5 次密码将锁定 5 分钟</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
