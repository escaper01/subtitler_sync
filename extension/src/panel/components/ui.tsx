import type { ReactNode } from 'react';

/** Small shared primitives. Everything here renders inside the panel's shadow root. */

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  title,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  const variants = {
    default: 'bg-white/10 text-white hover:bg-white/20 border border-white/10',
    primary: 'bg-sky-500 text-white hover:bg-sky-400 border border-sky-400/50',
    ghost: 'bg-transparent text-white/70 hover:bg-white/10 border border-transparent',
    danger: 'bg-transparent text-red-300 hover:bg-red-500/20 border border-red-400/30',
  };
  const sizes = { sm: 'px-2 py-1 text-[11px]', md: 'px-2.5 py-1.5 text-xs' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${
        active ? 'bg-sky-500 text-white border border-sky-400/50' : variants[variant]
      } ${sizes[size]}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-white/70">{label}</span>
        {hint && <span className="text-[10px] tabular-nums text-white/40">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={`${round(value, step)}${unit}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded bg-white/20 accent-sky-400"
      />
    </Field>
  );
}

function round(value: number, step: number): string {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return value.toFixed(decimals);
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-20 rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[11px] text-white/80 outline-none focus:border-sky-400/60"
        />
      </div>
    </Field>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded border border-white/10 bg-black/40 px-1.5 py-1 text-xs text-white/90 outline-none focus:border-sky-400/60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-neutral-900">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5">
      <span className="text-[11px] font-medium text-white/70">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-sky-400"
      />
    </label>
  );
}

export function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'error' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    error: 'border-red-400/40 bg-red-500/15 text-red-200',
    info: 'border-sky-400/30 bg-sky-500/15 text-sky-100',
  };
  return (
    <div className={`flex items-start gap-2 rounded border px-2 py-1.5 text-[11px] ${tones[tone]}`}>
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-white/50 hover:text-white"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** `mm:ss` — the form people read timestamps in. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const sign = seconds < 0 ? '-' : '';
  const total = Math.abs(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${pad(m)}:${pad(s)}`;
}
