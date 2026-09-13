/**
 * Publish remote/config.json to the public config repository.
 *
 *   npm run config:publish
 *
 * The extension fetches its config from `escaper01/subtitler-config` on GitHub — a
 * separate, *public* repository, because this one is private and raw.githubusercontent.com
 * answers 404 for private files. The file is authored here (where `remote.test.ts` checks
 * it against the bundled defaults and `LIVE=1 npm test` checks the selectors against the
 * real site) and pushed there by this script, through the GitHub contents API, so there is
 * no second checkout to keep around.
 *
 * Needs `gh` signed in (`gh auth status`). Refuses to publish a file that does not parse.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'escaper01/subtitler-config';
const PATH = 'config.json';
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../remote/config.json');

const body = readFileSync(SOURCE, 'utf8');
JSON.parse(body); // throws on a file that would never have been accepted anyway

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

// The contents API needs the current blob's sha to update it; without one it would only
// create, and fail because the file exists.
const current = JSON.parse(gh('api', `repos/${REPO}/contents/${PATH}`));
const remote = Buffer.from(current.content, 'base64').toString('utf8');

if (remote === body) {
  console.log(`${REPO}/${PATH} is already up to date`);
  process.exit(0);
}

const result = JSON.parse(
  gh(
    'api',
    '-X',
    'PUT',
    `repos/${REPO}/contents/${PATH}`,
    '-f',
    'message=update config.json',
    '-f',
    `content=${Buffer.from(body).toString('base64')}`,
    '-f',
    `sha=${current.sha}`,
  ),
);

console.log(`published ${REPO}/${PATH} @ ${result.commit.sha.slice(0, 7)}`);
console.log('Installs pick it up within six hours (the cache TTL in src/lib/subtitlecat/remote.ts).');
