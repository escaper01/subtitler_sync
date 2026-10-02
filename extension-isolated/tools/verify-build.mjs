/**
 * Post-build sanity check on dist/.
 *
 *   node tools/verify-build.mjs
 *
 * Guards one specific failure that cost real debugging time and produces no error anywhere:
 *
 * Rollup names each output chunk after its entry's *basename*. When the service worker and
 * the content script were both called `index.ts`, both emitted `index.ts-<hash>.js` — and
 * the generated `service-worker-loader.js` bound to the wrong one. The service worker then
 * ran the content script, which touches `window` at startup, threw before registering any
 * message listener, and left every `sendMessage` rejecting with "Receiving end does not
 * exist". Nothing logs that. The extension simply stops answering.
 *
 * So: verify the loaders point at chunks built from the entries they are supposed to be.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// `node tools/verify-build.mjs --firefox` checks dist-firefox/ instead of dist/.
const FIREFOX = process.argv.includes('--firefox');
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), FIREFOX ? '../dist-firefox' : '../dist');

const problems = [];

function read(path) {
  try {
    return readFileSync(resolve(DIST, path), 'utf8');
  } catch {
    problems.push(`missing from dist/: ${path}`);
    return null;
  }
}

/**
 * The chunk a crxjs loader pulls in. The two loaders have different shapes:
 *
 *   service worker   import './assets/service-worker.ts-hash.js'
 *   content script   await import(chrome.runtime.getURL("assets/content-script.ts-hash.js"))
 */
function importedChunk(loaderSource) {
  const direct = /import\s*['"]\.\/(.+?)['"]/.exec(loaderSource)?.[1];
  const viaGetUrl = /getURL\(\s*['"]\.?\/?(.+?)['"]\s*\)/.exec(loaderSource)?.[1];
  return direct ?? viaGetUrl ?? null;
}

/** Assert a loader resolves to a chunk built from the expected entry file. */
function expectEntry(label, loaderPath, expectedEntry) {
  const loader = read(loaderPath);
  if (loader === null) return;

  const chunk = importedChunk(loader);
  if (!chunk) {
    problems.push(`${label}: could not read an import out of ${loaderPath}`);
    return;
  }

  // Chunks are named `<entry basename>-<hash>.js`.
  if (!basename(chunk).startsWith(`${expectedEntry}-`)) {
    problems.push(
      `${label}: ${loaderPath} loads "${chunk}", which was not built from ${expectedEntry}. ` +
        `Two entry points probably share a basename — give them distinct filenames.`,
    );
    return;
  }

  if (read(chunk) === null) {
    problems.push(`${label}: ${loaderPath} points at ${chunk}, which does not exist`);
  }
}

const manifest = JSON.parse(read('manifest.json') ?? '{}');

// Chrome declares a service worker; Firefox an event page, as `scripts`.
expectEntry(
  FIREFOX ? 'event page' : 'service worker',
  (FIREFOX ? manifest.background?.scripts?.[0] : manifest.background?.service_worker) ?? '',
  'service-worker.ts',
);

const contentScript = manifest.content_scripts?.[0]?.js?.[0];
if (!contentScript) {
  problems.push('manifest has no content script');
} else {
  expectEntry('content script', contentScript, 'content-script.ts');
}

// The offscreen document is opened by URL from the worker rather than named in the
// manifest, so nothing else notices when it fails to build: parsing simply throws
// "no such page" at the first search. The path must match background/offscreen.ts.
// Firefox has none — it parses in its background page — and must not declare the permission.
if (FIREFOX) {
  if (manifest.permissions?.includes('offscreen')) {
    problems.push('manifest asks for "offscreen", which Firefox does not know');
  }
  if (!manifest.browser_specific_settings?.gecko?.id) {
    problems.push('manifest has no browser_specific_settings.gecko.id');
  }
  if (manifest.key) problems.push('manifest carries a Chrome "key"');
} else {
  read('src/offscreen/offscreen.html');
}

// Every icon the manifest promises has to actually be there, or Chrome shows a blank square
// and says nothing about why.
for (const path of Object.values(manifest.icons ?? {})) read(path);

if (problems.length > 0) {
  console.error('dist/ is not usable:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('dist/ looks right: loaders resolve to the entries they name.');
