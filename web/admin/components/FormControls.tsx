import type { ChangeEvent, ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cx } from '@admin/cx';
import s from './FormControls.module.css';

/* ------------------------------------------------------------------ *
 * 表单基础件（中后台列表页筛选 / 抽屉表单共用）
 * ------------------------------------------------------------------ */

export interface FieldProps {
  label?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

export function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <label className={s.field}>
      {label ? (
        <span className={s.fieldLabel}>
          {label}
          {required ? <span className={s.required}> *</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className={s.fieldError}>{error}</span> : null}
      {!error && hint ? <span className={s.fieldHint}>{hint}</span> : null}
    </label>
  );
}

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'datetime-local';
  disabled?: boolean;
  id?: string;
  name?: string;
  autoComplete?: string;
  maxLength?: number;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  id,
  name,
  autoComplete,
  maxLength,
}: TextInputProps) {
  return (
    <input
      id={id}
      name={name}
      className={s.input}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete={autoComplete}
      maxLength={maxLength}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

export interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

export function TextArea({ value, onChange, placeholder, rows = 3, maxLength }: TextAreaProps) {
  return (
    <textarea
      className={s.textarea}
      value={value}
      rows={rows}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  id?: string;
}

export function Select({ value, onChange, options, disabled, id }: SelectProps) {
  return (
    <select
      id={id}
      className={s.select}
      value={value}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}

/** 带放大镜图标的关键词检索框（回车触发 onSubmit） */
export function SearchInput({ value, onChange, placeholder, onSubmit }: SearchInputProps) {
  return (
    <div className={s.search}>
      <Search size={14} className={s.searchIcon} aria-hidden="true" />
      <input
        className={s.searchInput}
        type="text"
        value={value}
        placeholder={placeholder ?? '搜索关键词'}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) onSubmit();
        }}
      />
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  name?: string;
  disabled?: boolean;
}

/** 分段单选（审核判定结论、处置动作等少量选项场景，比下拉更直观） */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className={s.segmented} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          name={name}
          disabled={disabled}
          className={cx(s.segment, value === o.value && s.segmentActive)}
          onClick={() => onChange(o.value)}
        >
          <span className={s.segmentLabel}>{o.label}</span>
          {o.description ? <span className={s.segmentDesc}>{o.description}</span> : null}
        </button>
      ))}
    </div>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label className={s.checkbox}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label ? <span className={s.checkboxLabel}>{label}</span> : null}
    </label>
  );
}
