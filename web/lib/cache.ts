/**
 * A small TTL cache, so a popular film is scraped once rather than once per viewer.
 *
 * In-memory, which on Vercel means per-instance and lost on cold start. That is fine at
 * this stage — the worst case is an extra upstream fetch — but it is the reason the cache
 * moves to Postgres alongside the licence work, where the hit rate actually matters.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private entries = new Map<string, Entry<T>>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Refresh insertion order so eviction below is least-recently-used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Run `produce` unless the key is already cached. Concurrent misses may both run. */
  async wrap(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const value = await produce();
    this.set(key, value);
    return value;
  }
}
