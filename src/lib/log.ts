import type { LogEvent, LogLevel } from '@/types';

const CAPACITY = 500;

/** Fixed-size ring buffer. Oldest entries fall off the front. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(private capacity: number = CAPACITY) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }
  }

  pushAll(items: readonly T[]): void {
    for (const item of items) this.push(item);
  }

  all(): T[] {
    return this.items.slice();
  }

  last(n: number): T[] {
    return this.items.slice(-n);
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

/**
 * True while our extension context is still alive.
 *
 * After the extension is reloaded, content scripts from the previous load stay on the
 * page and every `chrome.*` call throws "Extension context invalidated". Everything that
 * touches the chrome APIs from a content script must check this first.
 */
export function contextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

type Sink = (events: LogEvent[]) => void;

class Logger {
  readonly buffer = new RingBuffer<LogEvent>(CAPACITY);
  private pending: LogEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sink: Sink | null = null;
  /** Mirror to the devtools console. Handy while developing, noisy otherwise. */
  echo = false;

  /**
   * Route events somewhere (content scripts forward them to the background).
   *
   * With `backfill`, everything already in the local ring buffer is sent too. Content
   * scripts attach their sink late — only once the frame turns out to contain a video —
   * so backfilling is what preserves the interesting history from before that point.
   */
  setSink(sink: Sink | null, options: { backfill?: boolean } = {}): void {
    const isNew = sink !== null && this.sink === null;
    this.sink = sink;
    if (sink && isNew && options.backfill) {
      this.pending = [...this.buffer.all(), ...this.pending];
      this.scheduleFlush();
    }
  }

  get hasSink(): boolean {
    return this.sink !== null;
  }

  private emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
    const event: LogEvent = { t: Date.now(), level, scope, message };
    if (data !== undefined) event.data = safeClone(data);

    this.buffer.push(event);

    if (this.echo) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(`[subtitler:${scope}] ${message}`, data ?? '');
    }

    if (this.sink) {
      this.pending.push(event);
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 400);
  }

  /** Send anything buffered to the sink immediately. */
  flush(): void {
    if (!this.sink || this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    try {
      this.sink(batch);
    } catch {
      // Sink is gone (context invalidated mid-flight). Dropping is correct here —
      // re-queuing would grow without bound on a dead context.
    }
  }

  debug(scope: string, message: string, data?: unknown) { this.emit('debug', scope, message, data); }
  info(scope: string, message: string, data?: unknown) { this.emit('info', scope, message, data); }
  warn(scope: string, message: string, data?: unknown) { this.emit('warn', scope, message, data); }
  error(scope: string, message: string, data?: unknown) { this.emit('error', scope, message, data); }
}

export const log = new Logger();

/**
 * Make a value safe to put in a structured-clone message.
 *
 * Errors and DOM nodes are common things to log and neither survives cloning, so they get
 * flattened rather than blowing up the whole batch.
 */
function safeClone(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Element) {
    return `<${value.tagName.toLowerCase()}${value.className ? ` class="${value.className}"` : ''}>`;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
