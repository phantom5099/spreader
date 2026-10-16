import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type {
  BatchDisposalResultItem,
  ActionSource,
  ContentDisposalAction,
  ContentDisposalInput,
  ContentObject,
} from '@admin/types';
import {
  ACTION_SOURCE_LABEL,
  CONTENT_DISPOSAL_ACTIONS,
  DISPOSAL_ACTION_LABEL,
  OBJECT_TYPE_LABEL,
  REASON_CATEGORIES,
  fromLocalInputValue,
  toLocalInputValue,
} from '@admin/labels';
import { Button } from './Button';
import { Field, Segmented, Select, TextArea, TextInput } from './FormControls';
import s from './DisposalForm.module.css';

const ACTION_DESC: Record<ContentDisposalAction, string> = {
  takedown: '内容对所有人不可见，可恢复',
  throttle: '降低分发权重，仅作者可见',
  delete: '内容删除，不可恢复',
  restore: '恢复至处置前状态',
};

const ERROR_TEXT: Record<'object_missing' | 'invalid_state', string> = {
  object_missing: '对象已不存在（作者已删除）',
  invalid_state: '当前状态不允许该操作',
};

const SOURCE_OPTIONS: { value: string; label: string }[] = (
  Object.keys(ACTION_SOURCE_LABEL) as ActionSource[]
).map((v) => ({ value: v, label: ACTION_SOURCE_LABEL[v] }));

export interface DisposalFormProps {
  /** 作用对象（批量时为多个；影响范围预览据此展示） */
  objects: ContentObject[];
  submitting: boolean;
  /** 执行结果（页面调 API 后回填；非空时切换为结果视图） */
  results: BatchDisposalResultItem[] | null;
  onSubmit: (input: ContentDisposalInput) => void;
}

/**
 * 处置表单（内容处置动作 + 原因类别 + 判定依据 + 生效/到期时间）
 *
 * 供「内容处置操作台」与「举报认定违规」两处复用；
 * 表单只负责收集与校验，提交动作由页面调用契约层完成。
 */
export function DisposalForm({ objects, submitting, results, onSubmit }: DisposalFormProps) {
  const [action, setAction] = useState<ContentDisposalAction>('takedown');
  const [reasonCategory, setReasonCategory] = useState('');
  const [basis, setBasis] = useState('');
  const [source, setSource] = useState<ActionSource>('patrol');
  const [effective, setEffective] = useState('');
  const [expires, setExpires] = useState('');
  const [errors, setErrors] = useState<{ reason_category?: string; basis?: string }>({});

  /* 限流默认给 7 天到期（仅当时用户没填时预填，不覆盖已有输入） */
  useEffect(() => {
    if (action === 'throttle' && !expires) {
      setExpires(toLocalInputValue(new Date(Date.now() + 7 * 24 * 3600_000).toISOString()));
    }
  }, [action, expires]);

  if (results) {
    const okCount = results.filter((r) => r.ok).length;
    return (
      <div className={s.results}>
        <p className={s.resultsSummary}>
          执行完成：成功 {okCount} 条，失败 {results.length - okCount} 条
        </p>
        <ul className={s.resultList}>
          {results.map((r) => {
            const obj = objects.find((o) => o.object_id === r.object_id);
            return (
              <li key={r.object_id} className={s.resultItem}>
                <span className={r.ok ? s.resultOk : s.resultFail}>{r.ok ? '成功' : '失败'}</span>
                <span className={s.resultLabel}>
                  {obj ? `${OBJECT_TYPE_LABEL[obj.object_type]}「${obj.preview}」` : r.object_id}
                </span>
                {r.ok ? null : (
                  <span className={s.resultError}>
                    {r.error ? ERROR_TEXT[r.error] : '未知错误'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className={s.resultNote}>
          每条处置均已生成独立记录并写入处置日志，可在「处置日志」页检索、导出；误处置可在记录上单独撤销。
        </p>
      </div>
    );
  }

  const submit = () => {
    const next: { reason_category?: string; basis?: string } = {};
    if (!reasonCategory) next.reason_category = '请选择原因类别';
    if (!basis.trim()) next.basis = '请填写判定依据（必填）';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      action,
      reason_category: reasonCategory,
      basis: basis.trim(),
      source,
      effective_at: fromLocalInputValue(effective),
      expires_at: fromLocalInputValue(expires),
    });
  };

  return (
    <div className={s.form}>
      <Field label="处置动作" required>
        <Segmented
          value={action}
          onChange={setAction}
          options={CONTENT_DISPOSAL_ACTIONS.map((a) => ({
            value: a,
            label: DISPOSAL_ACTION_LABEL[a],
            description: ACTION_DESC[a],
          }))}
        />
      </Field>

      <Field label="原因类别" required error={errors.reason_category}>
        <Select
          value={reasonCategory}
          onChange={(v) => {
            setReasonCategory(v);
            setErrors((e) => ({ ...e, reason_category: undefined }));
          }}
          options={[
            { value: '', label: '请选择' },
            ...REASON_CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
        />
      </Field>

      <Field label="判定依据" required error={errors.basis} hint="将写入处置记录与处置日志，作为留痕与复核依据">
        <TextArea
          value={basis}
          onChange={(v) => {
            setBasis(v);
            setErrors((e) => ({ ...e, basis: undefined }));
          }}
          placeholder="说明判定理由，如：命中策略、举报核实情况、法规条款等"
          rows={3}
        />
      </Field>

      <Field label="处置来源">
        <Select value={source} onChange={(v) => setSource(v as ActionSource)} options={SOURCE_OPTIONS} />
      </Field>

      <div className={s.timeRow}>
        <Field label="生效时间" hint="留空 = 立即生效">
          <TextInput type="datetime-local" value={effective} onChange={setEffective} />
        </Field>
        <Field label="到期时间" hint="留空 = 长期；限流建议限时">
          <TextInput type="datetime-local" value={expires} onChange={setExpires} />
        </Field>
      </div>

      <div className={s.impact}>
        <AlertTriangle size={14} className={s.impactIcon} aria-hidden="true" />
        <div>
          <p className={s.impactTitle}>
            影响范围：将对 {objects.length} 个对象执行「{DISPOSAL_ACTION_LABEL[action]}」
          </p>
          <ul className={s.impactList}>
            {objects.slice(0, 4).map((o) => (
              <li key={`${o.object_type}-${o.object_id}`}>
                {OBJECT_TYPE_LABEL[o.object_type]} {o.object_id}「{o.preview}」
              </li>
            ))}
            {objects.length > 4 ? <li>等 {objects.length} 条…</li> : null}
          </ul>
        </div>
      </div>

      <div className={s.actions}>
        <Button variant="primary" loading={submitting} onClick={submit}>
          确认执行
        </Button>
      </div>
    </div>
  );
}
