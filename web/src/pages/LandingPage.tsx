import { Link } from 'react-router-dom';
import { BadgeCheck, Hash, ImagePlus, MessagesSquare, UsersRound } from 'lucide-react';
import styles from './LandingPage.module.css';

const FEATURES = [
  {
    icon: MessagesSquare,
    title: '短动态，直给结论',
    desc: '2000 字以内把想法说完。支持文字、图片与视频，九宫格排版自动适配。',
  },
  {
    icon: UsersRound,
    title: '关注关系清晰可控',
    desc: '关注、粉丝、黑名单与静音各自成册，随时可以整理自己看到的世界。',
  },
  {
    icon: Hash,
    title: '话题聚合同好',
    desc: '用 #话题 组织内容，热门与最新两路排序，关注后即可持续跟踪。',
  },
  {
    icon: ImagePlus,
    title: '媒体优先的排版',
    desc: '媒体九宫格、视频播放与敏感内容遮罩，浏览体验在视觉上不打折。',
  },
];

/**
 * 启动页 / 落地页
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      {/* ---------- 顶部导航 ---------- */}
      <header className={styles.topbar}>
        <div className={styles.topbar__inner}>
          <Link to="/welcome" className={styles.brand} aria-label="spreader 首页">
            <span className={styles.brand__mark}>S</span>
            <span className={styles.brand__name}>spreader</span>
          </Link>

          <nav className={styles.topbar__nav} aria-label="快捷入口">
            <Link to="/" className={styles.topbar__link}>
              先逛逛信息流
            </Link>
            <Link to="/login" className={styles.topbar__cta}>
              登录
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- 主视觉 ---------- */}
      <main className={styles.hero}>
        <div className={styles.hero__inner}>
          <div className={styles.hero__copy}>
            <span className={styles.hero__eyebrow}>开源 · 自托管友好</span>
            <h1 className={styles.hero__title}>
              一个属于你自己的
              <br />
              <span className={styles.hero__accent}>短动态社区</span>
            </h1>
            <p className={styles.hero__desc}>
              spreader 是一个开源的信息流产品原型。没有广告、没有推荐算法黑箱，
              你关注谁，就只看到谁。数据归你所有，代码也归你所有。
            </p>

            <div className={styles.hero__actions}>
              <Link to="/signup" className={styles.btnPrimary}>
                创建账号
              </Link>
              <Link to="/" className={styles.btnGhost}>
                无需登录，先看看
              </Link>
            </div>

            <p className={styles.hero__fine}>
              <BadgeCheck size={15} strokeWidth={2.1} aria-hidden />
              独立开源实现，与任何第三方社交平台不存在关联、授权或赞助关系。
            </p>
          </div>

          {/* 右侧示意卡（纯装饰，用真实信息流卡片形态） */}
          <div className={styles.hero__art} aria-hidden>
            <div className={styles.ghost}>
              <span className={styles.ghost__avatar} />
              <span className={styles.ghost__lines}>
                <span className={styles.ghost__line} style={{ width: '38%' }} />
                <span className={styles.ghost__line} style={{ width: '92%' }} />
                <span className={styles.ghost__line} style={{ width: '76%' }} />
              </span>
            </div>
            <div className={[styles.ghost, styles['ghost--mid']].join(' ')}>
              <span className={styles.ghost__avatar} />
              <span className={styles.ghost__lines}>
                <span className={styles.ghost__line} style={{ width: '46%' }} />
                <span className={styles.ghost__line} style={{ width: '84%' }} />
              </span>
            </div>
            <div className={[styles.ghost, styles['ghost--low']].join(' ')}>
              <span className={styles.ghost__avatar} />
              <span className={styles.ghost__lines}>
                <span className={styles.ghost__line} style={{ width: '32%' }} />
                <span className={styles.ghost__line} style={{ width: '68%' }} />
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ---------- 特性 ---------- */}
      <section className={styles.features} aria-label="产品特性">
        <div className={styles.features__inner}>
          {FEATURES.map((f) => (
            <article key={f.title} className={styles.feature}>
              <span className={styles.feature__icon} aria-hidden>
                <f.icon size={20} strokeWidth={1.9} />
              </span>
              <h2 className={styles.feature__title}>{f.title}</h2>
              <p className={styles.feature__desc}>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- 页脚 ---------- */}
      <footer className={styles.footer}>
        <div className={styles.footer__inner}>
          <span>© 2026 spreader · MIT License</span>
          <nav className={styles.footer__links} aria-label="相关链接">
            <Link to="/settings/about">关于</Link>
            <Link to="/settings/licenses">开源许可</Link>
            <Link to="/login">登录</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
