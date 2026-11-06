import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Small shared primitives. Everything here renders inside the panel's shadow root. */

/**
 * A text input that can be typed into on top of a video player.
 *
 * Two things fight us. Keystrokes that escape the panel reach the player, which binds
 * space to play/pause — so every key event stops here. And the player's own handler is
 * often registered on `document` in the **capture** phase, which runs before the event
 * reaches this input at all: it calls `preventDefault()` to stop the page scrolling, and
 * that cancels the character insertion too. The space simply never appears.
 *
 * Capture-phase `preventDefault` cannot be undone from here, so when it has already
 * happened the space is inserted by hand and the caret put back. That is the whole reason
 * this component exists rather than a bare `<input>`; it is why space worked only
 * sometimes, depending on which player was underneath.
 */
export function TextInput({
  value,
  onChange,
  onEnter,
  className = '',
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  /** Where to put the caret after a hand-inserted character has been rendered. */
  const caret = useRef<number | null>(null);

  useEffect(() => {
    if (caret.current === null) return;
    ref.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  /**
   * Whether the user put the caret here and has not deliberately left. Some players pull
   * focus back to themselves on every key press, which ends typing after one letter. A blur
   * that nobody asked for is undone; one the user caused (a click elsewhere, Tab, Escape) is
   * left alone.
   */
  const wanted = useRef(false);

  useEffect(() => {
    const leave = (event: Event) => {
      const input = ref.current;
      if (input && !event.composedPath().includes(input)) wanted.current = false;
    };
    const leaveOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'Escape') wanted.current = false;
    };
    window.addEventListener('pointerdown', leave, true);
    window.addEventListener('keydown', leaveOnKey, true);
    return () => {
      window.removeEventListener('pointerdown', leave, true);
      window.removeEventListener('keydown', leaveOnKey, true);
    };
  }, []);

  const keepFocus = () => {
    const input = ref.current;
    if (!wanted.current || !input || !document.hasFocus()) return;
    requestAnimationFrame(() => {
      if (wanted.current && input.isConnected && input.getRootNode() instanceof ShadowRoot) {
        if ((input.getRootNode() as ShadowRoot).activeElement !== input) {
          input.focus({ preventScroll: true });
        }
      }
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Never let the player see typing, whatever the key.
    event.stopPropagation();

    if (event.key === 'Enter') {
      onEnter?.();
      return;
    }

    if (event.key !== ' ' || !event.nativeEvent.defaultPrevented) return;

    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;

    caret.current = start + 1;
    onChange(`${input.value.slice(0, start)} ${input.value.slice(end)}`);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      value={value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => event.stopPropagation()}
      onFocus={() => {
        wanted.current = true;
      }}
      onBlur={keepFocus}
      className={`rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white/85 outline-none placeholder:text-white/25 focus:border-sky-400/60 ${className}`}
    />
  );
}

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

/**
 * A small "ⓘ" that reveals one sentence of explanation, on hover or on click.
 *
 * For a control whose purpose isn't obvious from its label but doesn't deserve a
 * paragraph sitting permanently under it — hover explains it in passing; click pins it
 * open for anyone on a touch screen, or anyone who moved the mouse away to read it.
 *
 * Not inside a `<label>`: a click here must not also toggle whatever checkbox the label
 * wraps, so this is meant to sit *beside* one, not inside it.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  // Click-to-pin needs an outside click to unpin. `composedPath` because this renders
  // inside a shadow root, where `event.target` is retargeted to the host from the
  // document's point of view.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      const element = root.current;
      if (element && !event.composedPath().includes(element)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  return (
    <span
      ref={root}
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          setOpen((was) => !was);
        }}
        aria-label="More information"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/20 text-[9px] leading-none text-white/45 hover:border-white/40 hover:text-white/80"
      >
        i
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-48 rounded border border-white/15 bg-neutral-900 px-2 py-1.5 text-[10px] leading-relaxed text-white/70 shadow-xl">
          {text}
        </div>
      )}
    </span>
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
