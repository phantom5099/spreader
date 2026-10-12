import { useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Modal, modalStyles } from '@/components/common/Modal';
import { toast } from '@/stores/toastStore';
import styles from './ReportModal.module.css';

/** 举报原因分类 */
const REASONS: Array<{ key: string; label: string; desc: string; sub?: string[] }> = [
  {
    key: 'spam',
    label: '垃圾内容',
    desc: '重复发布、刷屏、诱导点击或商业推广',
  },
  {
    key: 'harassment',
    label: '骚扰与仇恨言论',
    desc: '针对个人或群体的攻击、威胁、歧视',
  },
  {
    key: 'violence',
    label: '暴力与血腥',
    desc: '展示真实暴力、伤害或令人不适的画面',
  },
  {
    key: 'adult',
    label: '成人内容',
    desc: '露骨的色情内容或性暗示',
  },
  {
    key: 'selfharm',
    label: '自杀或自残',
    desc: '鼓励、美化自伤行为的内容',
  },
  {
    key: 'misinfo',
    label: '虚假信息',
    desc: '可能造成现实伤害的误导性内容',
  },
  {
    key: 'impersonation',
    label: '冒充他人',
    desc: '冒用他人身份、头像或名义',
  },
  {
    key: 'copyright',
    label: '侵犯版权',
    desc: '未经授权使用他人的作品',
  },
];

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  /** 举报对象描述，如"@user20001 的动态" */
  targetLabel: string;
  onSubmitted?: (reason: string) => void;
}

/**
 * 举报页（模态层）
 * 分类选择 + 补充说明 + 证据。
 * 做成模态而非独立页 —— 举报是从详情页唤起的从属流程，独立路由会丢上下文。
 */
export function ReportModal({ open, onClose, targetLabel, onSubmitted }: ReportModalProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [blockToo, setBlockToo] = useState(false);
  const [step, setStep] = useState<'pick' | 'detail'>('pick');

  const selected = useMemo(() => REASONS.find((r) => r.key === reason) ?? null, [reason]);

  const reset = () => {
    setReason(null);
    setDetail('');
    setIncludeEvidence(true);
    setBlockToo(false);
    setStep('pick');
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    if (!selected) return;
    onSubmitted?.(selected.label);
    toast.success('举报已提交，我们会在 3 个工作日内处理');
    if (blockToo) toast.show('同时已拉黑该账号');
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={step === 'pick' ? '举报' : '补充说明'}
      closeOnOverlay={false}
      headActions={
        step === 'detail' ? (
          <button
            type="button"
            className={`${modalStyles.btn} ${modalStyles['btn--primary']}`}
            onClick={submit}
          >
            提交举报
          </button>
        ) : null
      }
    >
      {step === 'pick' ? (
        <div className={styles.pick}>
          <p className={styles.pick__intro}>
            你正在举报 <strong>{targetLabel}</strong>。请选择最符合的原因，
            我们会根据社区规范进行审核。
          </p>

          <div className={styles.reasons}>
            {REASONS.map((r) => {
              const on = reason === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  className={[styles.reason, on ? styles['reason--on'] : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={on}
                  onClick={() => setReason(r.key)}
                >
                  <span className={styles.reason__body}>
                    <span className={styles.reason__label}>{r.label}</span>
                    <span className={styles.reason__desc}>{r.desc}</span>
                  </span>
                  <span
                    className={[styles.reason__check, on ? styles['reason__check--on'] : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden
                  >
                    {on ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.pick__foot}>
            <button
              type="button"
              className={styles.pick__next}
              disabled={!reason}
              onClick={() => setStep('detail')}
            >
              下一步
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.detail}>
          <div className={styles.detail__summary}>
            <span className={styles.detail__summaryLabel}>举报原因</span>
            <span className={styles.detail__summaryValue}>{selected?.label}</span>
            <button type="button" className={styles.detail__change} onClick={() => setStep('pick')}>
              更改
            </button>
          </div>

          <label className={styles.detail__field}>
            <span className={styles.detail__label}>
              补充说明（选填）
              <span className={styles.detail__count}>{detail.length}/200</span>
            </span>
            <textarea
              className={styles.detail__textarea}
              value={detail}
              maxLength={200}
              rows={4}
              placeholder="说明具体情况可以帮助我们更快判断，例如问题出现在第几张图、是否有前因后果。"
              onChange={(e) => setDetail(e.target.value)}
            />
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              className={styles.checkRow__box}
              checked={includeEvidence}
              onChange={(e) => setIncludeEvidence(e.target.checked)}
            />
            <span className={styles.checkRow__text}>
              附带证据（自动包含该动态的链接与截图）
            </span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              className={styles.checkRow__box}
              checked={blockToo}
              onChange={(e) => setBlockToo(e.target.checked)}
            />
            <span className={styles.checkRow__text}>同时拉黑该账号</span>
          </label>

          <div className={styles.notice}>
            <AlertTriangle size={15} strokeWidth={2} aria-hidden />
            <span>
              恶意举报可能导致你的账号受到限制。举报记录可以在「设置 → 我的举报记录」中查看。
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
