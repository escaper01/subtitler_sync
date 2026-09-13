import type { LogLevel } from '@/types';

/**
 * Logging.
 *
 * Events go to the devtools console and nowhere else. They are off by default because this
 * script starts in every frame of an allowed page, including the player's iframe, and a
 * running commentary in the site's own console is not something to inflict by default.
 *
 * To turn it on for a page — including one you can't otherwise instrument — run
 * `localStorage['subtitler:debug'] = '1'` in its console and reload.
 */

const FLAG = 'subtitler:debug';

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

function flagSet(): boolean {
  try {
    return localStorage.getItem(FLAG) !== null;
  } catch {
    // Sandboxed frame, or storage blocked by the user's settings.
    return false;
  }
}

class Logger {
  /** Mirror to the devtools console. Set from the page flag, overridable at runtime. */
  echo = flagSet();

  private emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
    // Errors always print: a silent failure here is one nobody can diagnose afterwards.
    if (!this.echo && level !== 'error') return;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data === undefined) fn(`[subtitler:${scope}] ${message}`);
    else fn(`[subtitler:${scope}] ${message}`, data);
  }

  debug(scope: string, message: string, data?: unknown) { this.emit('debug', scope, message, data); }
  info(scope: string, message: string, data?: unknown) { this.emit('info', scope, message, data); }
  warn(scope: string, message: string, data?: unknown) { this.emit('warn', scope, message, data); }
  error(scope: string, message: string, data?: unknown) { this.emit('error', scope, message, data); }
}

export const log = new Logger();
