import { useNavigate } from 'react-router-dom';
import { BookOpen, ExternalLink, Github, Scale, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsGroup, SettingsRow, SettingsValue } from '@/components/settings/SettingsRow';
import { toast } from '@/stores/toastStore';
import styles from './SettingsAboutPage.module.css';

/**
 * 关于页（设置组）
 * 承载开源许可、免责声明、版本信息 —— 与仓库根的 LICENSE 对应。
 */
export function SettingsAboutPage() {
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="关于" onBack={() => navigate('/settings')} />

          {/* 品牌区 */}
          <div className={styles.brand}>
            <span className={styles.brand__logo} aria-hidden>
              S
            </span>
            <h2 className={styles.brand__name}>spreader</h2>
            <span className={styles.brand__version}>版本 0.1.0 · demo 构建</span>
            <p className={styles.brand__desc}>
              一个以内容分享为核心的社交平台。当前为前端静态演示版本，
              数据全部来自本地 mock，不连接真实后端。
            </p>
          </div>

          <SettingsGroup title="开源与许可">
            <SettingsRow
              icon={<Scale size={19} strokeWidth={1.9} />}
              label="开源许可证"
              desc="MIT License"
              to="/settings/licenses"
              control={<SettingsValue>查看</SettingsValue>}
            />
            <SettingsRow
              icon={<ShieldCheck size={19} strokeWidth={1.9} />}
              label="第三方依赖许可"
              desc="全部为宽松许可，无 copyleft 依赖"
              to="/settings/licenses"
            />
            <SettingsRow
              icon={<Github size={19} strokeWidth={1.9} />}
              label="源代码仓库"
              to="/settings/licenses"
            />
          </SettingsGroup>

          <SettingsGroup title="说明">
            <SettingsRow
              icon={<BookOpen size={19} strokeWidth={1.9} />}
              label="独立实现说明"
              desc="本项目为独立开源实现，与任何第三方社交平台不存在关联、授权或赞助关系"
            />
            <SettingsRow
              icon={<ExternalLink size={19} strokeWidth={1.9} />}
              label="服务条款"
              onClick={() => toast.show('服务条款（Demo 未提供正文）')}
            />
            <SettingsRow
              icon={<ExternalLink size={19} strokeWidth={1.9} />}
              label="隐私政策"
              onClick={() => toast.show('隐私政策（Demo 未提供正文）')}
            />
          </SettingsGroup>

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  我的举报记录                                                                 */
/* -------------------------------------------------------------------------- */

const REPORTS = [
  { id: 'r1', target: '疑似垃圾推广的动态', reason: '垃圾内容', at: '2026年10月9日', status: '已处理' },
  { id: 'r2', target: '@spam_account_88', reason: '冒充他人', at: '2026年10月4日', status: '处理中' },
  { id: 'r3', target: '疑似暴力内容', reason: '暴力与血腥', at: '2026年9月27日', status: '已驳回' },
  { id: 'r4', target: '疑似骚扰回复', reason: '骚扰与仇恨言论', at: '2026年9月18日', status: '已处理' },
];

export function SettingsReportsPage() {
  const navigate = useNavigate();

  const tone = (status: string) =>
    status === '已处理' ? styles['status--done'] : status === '处理中' ? styles['status--pending'] : styles['status--rejected'];

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.page__main}>
          <PageHeader title="我的举报记录" onBack={() => navigate('/settings')} />

          {REPORTS.length === 0 ? (
            <div className={styles.empty}>
              <ShieldCheck size={26} strokeWidth={1.6} aria-hidden />
              <h3 className={styles.empty__title}>还没有举报记录</h3>
              <p className={styles.empty__desc}>
                当你在动态或用户页面提交举报后，处理进度会显示在这里。
              </p>
            </div>
          ) : (
            <div className={styles.reportList}>
              {REPORTS.map((r) => (
                <div key={r.id} className={styles.report}>
                  <div className={styles.report__top}>
                    <span className={styles.report__target}>{r.target}</span>
                    <span className={[styles.status, tone(r.status)].join(' ')}>{r.status}</span>
                  </div>
                  <div className={styles.report__meta}>
                    <span>原因：{r.reason}</span>
                    <span>·</span>
                    <span>{r.at}</span>
                  </div>
                  <div className={styles.report__actions}>
                    <button
                      type="button"
                      className={styles.report__btn}
                      onClick={() => toast.show('已提交申诉，我们会在 3 个工作日内复核')}
                    >
                      申诉
                    </button>
                    <button
                      type="button"
                      className={styles.report__btn}
                      onClick={() => toast.show('举报详情（Demo 未提供）')}
                    >
                      查看详情
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.tail} />
        </div>
      </div>
    </AppShell>
  );
}
