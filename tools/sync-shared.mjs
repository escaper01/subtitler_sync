/**
 * Keep the files the two extensions genuinely share identical.
 *
 *   node tools/sync-shared.mjs           copy extension/ -> extension-lite/
 *   node tools/sync-shared.mjs --check   exit 1 if any shared file differs
 *
 * `extension/` and `extension-lite/` are separate folders, which means every overlay fix,
 * every sync fix and every allowlist fix has to be made twice. The root CLAUDE.md already
 * warns what happens to files that are meant to match and are not enforced — a drifted
 * copy fails at runtime, in the one place nobody is looking. So they are enforced.
 *
 * The workflow: **fix it in `extension/`, run this, commit both.** `--check` runs inside
 * `npm run check` in each folder, so a forgotten sync fails the build rather than shipping
 * a bug that was already fixed once.
 *
 * `extension/` is the source of truth in one direction only. Never edit a shared file in
 * `extension-lite/` — the next sync overwrites it, silently.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = join(ROOT, 'extension');
const TO = join(ROOT, 'extension-lite');

/**
 * Files with no business differing between the two builds.
 *
 * The rule for adding one: if the search-free build would want a *different* version of it,
 * it does not belong here — put the difference in a file that already diverges (see
 * EXPECTED_TO_DIFFER) rather than making this list conditional.
 */
const SHARED = [
  // The parts nobody should ever have to fix twice.
  'src/lib/subtitles/parse.ts',
  'src/lib/subtitles/parse.test.ts',
  'src/lib/subtitles/lookup.ts',
  'src/lib/sync.ts',
  'src/lib/sync.test.ts',
  'src/lib/sites.ts',
  'src/lib/sites.test.ts',
  'src/lib/slots.ts',
  'src/lib/slots.test.ts',
  'src/lib/style.ts',
  'src/lib/storage.ts',
  'src/lib/videoKey.ts',
  'src/lib/log.ts',
  'src/lib/messaging.ts',

  // The overlay and its host. Every gotcha in extension/CLAUDE.md lives in here.
  'src/content/content-script.ts',
  'src/content/video-agent.ts',
  'src/content/overlay.ts',
  'src/content/panel-host.ts',

  // Panel components that know nothing about search.
  'src/panel/components/ui.tsx',
  'src/panel/components/StyleTab.tsx',
  'src/panel/components/SyncTab.tsx',
  'src/panel/components/SubtitlesTab.tsx',
  'src/panel/components/SitesEditor.tsx',
  'src/panel/components/SitesTab.tsx',
  'src/panel/components/SlotSelector.tsx',
  'src/panel/components/PanelBanner.tsx',

  // The popup is identical: it allows sites and shows a donate line, nothing else.
  'src/popup/Popup.tsx',
  'src/popup/DonateLine.tsx',
  'src/popup/main.tsx',
  'src/popup/popup.html',

  'src/styles/tailwind.css',

  // Build and tooling.
  'vite.config.ts',
  'tsconfig.json',
  'tools/make-icons.mjs',
  'tools/make-key.mjs',
  'tools/verify-build.mjs',
];

/**
 * `extension-isolated/` is deliberately NOT a target. It is a fork of `extension/` whose
 * search path diverges across types, the worker, the manifest and the build — enough that
 * a three-way sync would be more script than it is worth. A shared fix is applied there by
 * hand; its CLAUDE.md says so.
 */

/** Whole directories copied recursively. */
const SHARED_DIRS = ['public', 'test'];

/**
 * Files that are *supposed* to differ, listed so the difference is a decision rather than
 * an oversight. Nothing checks these; the list is documentation with a place to live.
 *
 *   src/types.ts              lite has no search or series messages, and fewer panel tabs
 *   src/lib/api-types.ts      lite carries only the donate shapes
 *   src/lib/api.ts            lite has one endpoint
 *   src/panel/store.ts        lite has no FindState and no search actions
 *   src/panel/App.tsx         four tabs, not five
 *   src/manifest.config.ts    different name, description and signing key
 *   package.json              different name and description
 *
 * And files that exist in `extension/` only: lib/languages.ts, lib/searchTitle.ts,
 * lib/searchStorage.ts, lib/tv.ts, lib/tvmaze.ts, panel/tvStore.ts,
 * panel/components/{FindTab,LanguagePicker,SeriesBrowser}.tsx.
 */

const check = process.argv.includes('--check');

function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

/** Every shared path, with directories expanded. */
function allPaths() {
  const paths = [...SHARED];
  for (const dir of SHARED_DIRS) {
    const source = join(FROM, dir);
    if (!existsSync(source)) continue;
    for (const file of filesUnder(source)) paths.push(join(dir, file).split('\\').join('/'));
  }
  return paths;
}

if (!existsSync(TO)) {
  console.error(`${TO} does not exist. Nothing to sync.`);
  process.exit(1);
}

const drifted = [];
const missing = [];
let copied = 0;

for (const path of allPaths()) {
  const source = join(FROM, path);
  const target = join(TO, path);

  if (!existsSync(source)) {
    missing.push(path);
    continue;
  }

  // Compared as bytes, not as text: a file that differs only in line endings is still a
  // file two people will diff and argue about.
  const content = readFileSync(source);
  const same = existsSync(target) && readFileSync(target).equals(content);
  if (same) continue;

  if (check) {
    drifted.push(path);
    continue;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  copied += 1;
}

if (missing.length > 0) {
  console.error('Listed as shared but missing from extension/:');
  for (const path of missing) console.error(`  ${path}`);
  console.error('\nRemove it from SHARED in tools/sync-shared.mjs, or restore the file.');
  process.exit(1);
}

if (check) {
  if (drifted.length === 0) {
    console.log(`shared files match (${allPaths().length} checked)`);
    process.exit(0);
  }

  console.error('These files are shared between the two extensions and have drifted:\n');
  for (const path of drifted) console.error(`  ${path}`);
  console.error('\nFix it in extension/, then run:  node tools/sync-shared.mjs');
  console.error('Never edit a shared file in extension-lite/ — the next sync overwrites it.');
  process.exit(1);
}

console.log(
  copied === 0
    ? `already in sync (${allPaths().length} files)`
    : `synced ${copied} file${copied === 1 ? '' : 's'} into extension-lite/`,
);
