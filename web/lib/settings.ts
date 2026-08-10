import { db } from '@/lib/db';

/**
 * The operator-tunable numbers.
 *
 * These were constants in the code. They moved because each one is something you need to
 * change in response to an event — abuse, cost, a promotion — and waiting for a deploy is
 * the wrong shape for that.
 *
 * Cached for a minute, because the gate reads them on every request and a settings row
 * that changes twice a week does not need a query each time. A minute is short enough that
 * "I tightened the limit and nothing happened" never becomes a real thought.
 */

export interface Settings {
  promptEnabled: boolean;
  promptMessage: string;
  promptColor: string;
  promptUrl: string | null;
  searchPerHour: number;
  searchPerDay: number;
  defaultDeviceLimit: number;
  trialDays: number;
}

/** Used when the row is missing or the database is unreachable. */
export const DEFAULT_SETTINGS: Settings = {
  promptEnabled: false,
  promptMessage: '',
  promptColor: '#38bdf8',
  promptUrl: null,
  searchPerHour: 60,
  searchPerDay: 300,
  defaultDeviceLimit: 2,
  trialDays: 7,
};

const TTL_MS = 60_000;

let cached: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  try {
    const row = await db.siteSetting.findUnique({ where: { id: 'singleton' } });
    const value: Settings = row
      ? {
          promptEnabled: row.promptEnabled,
          promptMessage: row.promptMessage,
          promptColor: row.promptColor,
          promptUrl: row.promptUrl,
          searchPerHour: row.searchPerHour,
          searchPerDay: row.searchPerDay,
          defaultDeviceLimit: row.defaultDeviceLimit,
          trialDays: row.trialDays,
        }
      : DEFAULT_SETTINGS;

    cached = { at: Date.now(), value };
    return value;
  } catch {
    // Never fail a request over a settings read. Falling back to the defaults means the
    // limits still apply during a database blip rather than disappearing.
    return cached?.value ?? DEFAULT_SETTINGS;
  }
}

/** Called after a write from the dashboard, so the change is visible immediately. */
export function invalidateSettings(): void {
  cached = null;
}
