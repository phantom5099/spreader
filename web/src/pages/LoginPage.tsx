import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AtSign,
  Check,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lock,
  Smartphone,
  X,
} from 'lucide-react';
import { ThirdPartyMark } from '@/components/common/ThirdPartyMark';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import styles from './LoginPage.module.css';

/* ==========================================================================
   登录方式
   设计要求：三入口 —— 手机号验证码 / 手机号密码 / 第三方。
   邮箱登录保留，且与手机号一样同时支持「验证码」与「密码」两种凭据，
   避免"手机号能免密、邮箱却只能记密码"的不对称。
   ========================================================================== */

type Channel = 'phone' | 'email';
type Credential = 'code' | 'password';

interface ChannelMeta {
  label: string;
  hint: string;
  icon: typeof Smartphone;
}

const CHANNEL_META: Record<Channel, ChannelMeta> = {
  phone: { label: '手机号', hint: '中国大陆号码，用于接收验证码', icon: Smartphone },
  email: { label: '邮箱', hint: '用于接收验证码与账号通知', icon: AtSign },
};

/** 无论哪种方式，Demo 都接受这个账号 —— 见下方 .demoTip 的公告 */
const DEMO_ACCOUNT = { account: 'admin@admin', password: '123456' };

/** 验证码有效期/重发间隔，对齐服务端调研里的硬指标（5 分钟有效 / 60s 内仅可发一次） */
const RESEND_COOLDOWN_SEC = 60;
const CODE_TTL_MIN = 5;

const PHONE_RX = /^1[3-9]\d{9}$/;
/*
 * 邮箱正则故意放宽：只要求「非空用户名 @ 非空域名」。
 */
const EMAIL_RX = /^[^\s@]+@[^\s@]+$/;

interface LoginPageProps {
  /** /signup 复用本页，仅切换标题与底部文案 */
  initialMode?: 'signin' | 'signup';
}

/**
 * 登录 / 注册页
 */
export function LoginPage({ initialMode = 'signin' }: LoginPageProps) {
  const navigate = useNavigate();
  const signIn = useAuthStore((s) => s.signIn);

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [channel, setChannel] = useState<Channel>('phone');
  const [credential, setCredential] = useState<Credential>('code');

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thirdPartyOpen, setThirdPartyOpen] = useState(false);

  /* 验证码：是否已发出 + 剩余秒数 */
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  /* 重发倒计时。只在 cooldown > 0 时挂定时器，避免空转 */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  const meta = CHANNEL_META[channel];
  const AccountIcon = meta.icon;

  /**
   * 校验时机：与补充信息页统一 —— 只在「提交过一次」之后才实时报错。
   */
  const [submitted, setSubmitted] = useState(false);

  const accountError = useMemo(() => {
    if (!account) return `请输入${meta.label}`;
    if (channel === 'phone') {
      if (!/^[\d\s+-]+$/.test(account)) return '手机号只能包含数字';
      if (!PHONE_RX.test(account.replace(/[\s+-]/g, '').replace(/^86/, ''))) {
        return '手机号格式不正确（11 位中国大陆号码）';
      }
      return null;
    }
    /*
     * 邮箱格式故意放宽：只要求「有用户名、有 @、有域名」
     */
    return EMAIL_RX.test(account) ? null : '邮箱格式不正确';
  }, [account, channel, meta.label]);

  const codeError = useMemo(() => {
    if (credential !== 'code') return null;
    if (!code) return '请输入验证码';
    if (!/^\d{6}$/.test(code)) return '验证码为 6 位数字';
    return null;
  }, [code, credential]);

  const pwError = useMemo(() => {
    if (credential !== 'password') return null;
    if (!password) return '请输入密码';
    if (mode === 'signup' && password.length < 8) return '密码至少 8 位';
    return null;
  }, [password, credential, mode]);

  /* 验证码模式：必须先拿到码才能提交，否则不让点（这是真·未就绪，不是格式提示） */
  const needCode = credential === 'code' && !codeSent;
  const canSubmit = !busy && !needCode;

  /* ---------- 交互 ---------- */

  const switchChannel = (next: Channel) => {
    setChannel(next);
    setAccount('');
    setCode('');
    setPassword('');
    setCodeSent(false);
    setCooldown(0);
    setSubmitted(false);
  };

  const switchCredential = (next: Credential) => {
    setCredential(next);
    setSubmitted(false);
  };

  const sendCode = useCallback(() => {
    /* 未填/填错账号时先别发，直接把错误显示出来 */
    setSubmitted(true);
    if (accountError) return;

    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SEC);
      /* Demo：验证码不真实下发，直接在提示里给出，方便走通流程 */
      toast.show('验证码已发送（Demo 固定为 123456）');
      codeRef.current?.focus();
    }, 600);
  }, [accountError]);

  const submit = useCallback(() => {
    setSubmitted(true);

    const accOk = !accountError;
    const credOk =
      credential === 'code'
        ? codeSent && /^\d{6}$/.test(code)
        : !!password && !(mode === 'signup' && password.length < 8);

    if (!accOk || !credOk) return;

    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);

      if (mode === 'signup') {
        /* 注册即登录：否则补充资料页会被路由守卫弹回登录页 */
        signIn();
        navigate('/signup/profile', { replace: true });
        return;
      }

      signIn();
      toast.success(
        account.trim().toLowerCase() === DEMO_ACCOUNT.account ? '欢迎回来，林知夏' : '登录成功',
      );
      navigate('/', { replace: true });
    }, 720);
  }, [account, accountError, credential, code, codeSent, password, mode, navigate, signIn]);

  const submitLabel = busy ? '处理中…' : mode === 'signin' ? '登录' : '注册并继续';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* ---------- 返回 ---------- */}
        <header className={styles.card__top}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="返回"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        {/* ---------- 品牌 ---------- */}
        <div className={styles.brand}>
          <span className={styles.brand__mark}>S</span>
          <h1 className={styles.brand__title}>
            {mode === 'signin' ? '登录 spreader' : '创建你的账号'}
          </h1>
          <p className={styles.brand__sub}>
            {mode === 'signin'
              ? '继续浏览你关注的人和话题。'
              : '手机号或邮箱验证一下就完成注册，无需单独设密码。'}
          </p>
        </div>

        {/* ---------- 第三方（占位） ---------- */}
        <div className={styles.thirdParty}>
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              className={styles.thirdParty__btn}
              aria-label="第三方账号登录（暂未接通）"
              onClick={() => setThirdPartyOpen(true)}
            >
              <ThirdPartyMark label="第三方账号登录" size={22} />
            </button>
          ))}
        </div>

        <div className={styles.divider}>
          <span className={styles.divider__line} />
          <span className={styles.divider__text}>或使用{meta.label}</span>
          <span className={styles.divider__line} />
        </div>

        {/* ---------- 表单 ---------- */}
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* 手机号 / 邮箱 切换 */}
          <div className={styles.segment} role="tablist" aria-label="登录账号类型">
            {(['phone', 'email'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={channel === c}
                className={[
                  styles.segment__item,
                  channel === c ? styles['segment__item--on'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => switchChannel(c)}
              >
                {CHANNEL_META[c].label}
              </button>
            ))}
          </div>

          {/* 账号 */}
          <label className={styles.field}>
            <span className={styles.field__label}>{meta.label}</span>
            <span
              className={[
                styles.field__wrap,
                submitted && accountError ? styles['field__wrap--error'] : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <AccountIcon size={17} strokeWidth={1.9} aria-hidden className={styles.field__icon} />
              <input
                className={styles.field__input}
                type={channel === 'phone' ? 'tel' : 'email'}
                inputMode={channel === 'phone' ? 'numeric' : 'email'}
                autoComplete={channel === 'phone' ? 'tel' : 'email'}
                value={account}
                placeholder={channel === 'phone' ? '13800000000' : 'you@example.com'}
                onChange={(e) => setAccount(e.target.value)}
              />
              {account ? (
                <button
                  type="button"
                  className={styles.field__clear}
                  aria-label={`清空${meta.label}`}
                  onClick={() => setAccount('')}
                >
                  <X size={15} strokeWidth={2.2} aria-hidden />
                </button>
              ) : null}
            </span>
            {submitted && accountError ? (
              <span className={styles.field__err}>{accountError}</span>
            ) : (
              <span className={styles.field__hint}>{meta.hint}</span>
            )}
          </label>

          {/* 验证码 / 密码 切换 */}
          <div className={styles.segment} role="tablist" aria-label="登录凭据类型">
            {(['code', 'password'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={credential === c}
                className={[
                  styles.segment__item,
                  credential === c ? styles['segment__item--on'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => switchCredential(c)}
              >
                {c === 'code' ? '验证码' : '密码'}
              </button>
            ))}
          </div>

          {credential === 'code' ? (
            <label className={styles.field}>
              <span className={styles.field__label}>验证码</span>
              <span
                className={[
                  styles.field__wrap,
                  submitted && codeError ? styles['field__wrap--error'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <KeyRound size={17} strokeWidth={1.9} aria-hidden className={styles.field__icon} />
                <input
                  ref={codeRef}
                  className={[styles.field__input, styles['field__input--code']]
                    .filter(Boolean)
                    .join(' ')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  placeholder="6 位数字"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                <button
                  type="button"
                  className={styles.field__send}
                  disabled={cooldown > 0 || busy}
                  onClick={sendCode}
                >
                  {cooldown > 0 ? `${cooldown}s 后重发` : codeSent ? '重新获取' : '获取验证码'}
                </button>
              </span>
              {submitted && codeError ? (
                <span className={styles.field__err}>{codeError}</span>
              ) : codeSent ? (
                <span className={styles.field__hint}>
                  验证码 {CODE_TTL_MIN} 分钟内有效。Demo 环境请直接填 <strong>123456</strong>。
                </span>
              ) : (
                <span className={styles.field__hint}>
                  未注册的{meta.label}将自动创建账号（登录即注册）。
                </span>
              )}
            </label>
          ) : (
            <label className={styles.field}>
              <span className={styles.field__label}>密码</span>
              <span
                className={[
                  styles.field__wrap,
                  submitted && pwError ? styles['field__wrap--error'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Lock size={17} strokeWidth={1.9} aria-hidden className={styles.field__icon} />
                <input
                  className={styles.field__input}
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  placeholder={mode === 'signup' ? '至少 8 位' : '请输入密码'}
                  onChange={(e) => setPassword(e.target.value)}
                  />
                <button
                  type="button"
                  className={styles.field__clear}
                  aria-label={showPw ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? (
                    <EyeOff size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <Eye size={16} strokeWidth={2} aria-hidden />
                  )}
                </button>
              </span>
              {submitted && pwError ? (
                <span className={styles.field__err}>{pwError}</span>
              ) : (
                <span className={styles.field__hint}>
                  Demo 环境固定密码为 <strong>{DEMO_ACCOUNT.password}</strong>。
                </span>
              )}
            </label>
          )}

          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            {submitLabel}
          </button>

          {mode === 'signin' ? (
            <button
              type="button"
              className={styles.forgot}
              onClick={() => toast.show('找回密码功能暂未开放（Demo）')}
            >
              忘记密码？
            </button>
          ) : (
            <p className={styles.terms}>注册即表示你同意《用户协议》与《隐私政策》。</p>
          )}
        </form>

        {/* ---------- 登录 / 注册 切换 ---------- */}
        <p className={styles.switchRow}>
          {mode === 'signin' ? (
            <>
              还没有账号？
              <button
                type="button"
                className={styles.switchRow__btn}
                onClick={() => setMode('signup')}
              >
                立即注册
              </button>
            </>
          ) : (
            <>
              已经有账号了？
              <button
                type="button"
                className={styles.switchRow__btn}
                onClick={() => setMode('signin')}
              >
                去登录
              </button>
            </>
          )}
        </p>

        {/* ---------- Demo 账号公告 ---------- */}
        <div className={styles.demoTip}>
          <Info size={16} strokeWidth={2.1} aria-hidden />
          <div className={styles.demoTip__body}>
            <p className={styles.demoTip__title}>Demo 可用账号</p>
            <p className={styles.demoTip__line}>
              账号 <code>{DEMO_ACCOUNT.account}</code>
              <span className={styles.demoTip__sep}>·</span>
              密码 <code>{DEMO_ACCOUNT.password}</code>
              <button
                type="button"
                className={styles.demoTip__use}
                aria-label="填入 Demo 账号"
                onClick={() => {
                  setChannel('email');
                  setCredential('password');
                  setAccount(DEMO_ACCOUNT.account);
                  setPassword(DEMO_ACCOUNT.password);
                  setSubmitted(false);
                  toast.show('已填入 Demo 账号');
                }}
              >
                <Check size={14} strokeWidth={2.4} aria-hidden />
                一键填入
              </button>
            </p>
            <p className={styles.demoTip__line}>
              验证码登录：任意合法手机号 / 邮箱，验证码固定 <code>123456</code>。
            </p>
            <p className={styles.demoTip__line}>
              Demo 内部任意账号密码也能通过 —— 这里是纯前端 mock，不做真实校验。
            </p>
          </div>
        </div>
      </div>

      {/* ---------- 第三方说明弹层 ---------- */}
      {thirdPartyOpen ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="第三方登录暂未接通"
          onClick={() => setThirdPartyOpen(false)}
        >
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheet__head}>
              <ThirdPartyMark label="第三方账号登录" size={26} />
              <h2 className={styles.sheet__title}>该渠道暂未接通</h2>
            </div>
            <p className={styles.sheet__desc}>
              这里预留了第三方账号登录的位置，但当前版本还没有接入任何真实渠道，
              因此显示为一个虚线圆占位图标。请改用{meta.label}验证码或密码登录。
            </p>
            <button
              type="button"
              className={styles.sheet__btn}
              onClick={() => setThirdPartyOpen(false)}
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { DEMO_ACCOUNT };
