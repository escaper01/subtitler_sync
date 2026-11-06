import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, readConfig } from '@/lib/subtitlecat/config';

/**
 * `remote/config.json` is what installs fetch; `DEFAULT_CONFIG` is what they fall back to.
 * At the moment a build is cut they should agree, or a fresh install behaves differently
 * from an established one for its first six hours. Edit the remote file to react to a site
 * change, then bring the default up to match before the next build.
 */
describe('remote/config.json', () => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../remote/config.json'), 'utf8'),
  ) as unknown;

  it('is valid: nothing in it falls back to a default', () => {
    const file = raw as { base: unknown; searchPath: unknown; selectors: unknown };
    const config = readConfig(raw);
    expect(config.base).toBe(file.base);
    expect(config.searchPath).toBe(file.searchPath);
    expect(config.selectors).toEqual(file.selectors);
  });

  it('carries the same site and selectors as the bundled default', () => {
    const config = readConfig(raw);
    expect(config.base).toBe(DEFAULT_CONFIG.base);
    expect(config.searchPath).toBe(DEFAULT_CONFIG.searchPath);
    expect(config.selectors).toEqual(DEFAULT_CONFIG.selectors);
  });
});
