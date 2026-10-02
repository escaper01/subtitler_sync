import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

/**
 * One manifest, two browsers. `vite build` produces the Chrome/Edge one; `vite build
 * --mode firefox` produces Firefox's. What differs, and why:
 *
 *   background   Firefox has no MV3 service workers — it runs an *event page*, declared as
 *                `scripts`. Same file, same listeners. An event page has a DOM, which is
 *                why Firefox needs no offscreen document (see background/offscreen.ts).
 *   key          Chrome pins its id with a public key. Firefox ignores it and wants
 *                `browser_specific_settings.gecko.id` instead.
 *   offscreen    An unknown permission in Firefox — it would be reported as a warning.
 */
export default defineManifest(({ mode }) => {
  const firefox = mode === 'firefox';

  return {
    manifest_version: 3,
    // Three builds can be installed side by side — the Store listing (`extension-lite/`),
    // the full build (`extension/`) and this one — so each is named to be told apart in
    // chrome://extensions. "Isolated": it needs no server of ours, only subtitlecat itself.
    name: 'Subtitle Synchronizer (Isolated)',
    version: pkg.version,
    // 132 characters is the Web Store's hard limit for the listing summary, and it is
    // truncated in search results well before that. Keep this one line.
    description:
      'Add subtitles to any video: load your own SRT/VTT or find one online, then fix the timing with a click.',

    // Pins the extension's identity. This is the PUBLIC half of `extension-isolated/key.pem`
    // — its own key, distinct from the other two builds', which is what lets all three be
    // installed at once. Regenerate both with `npm run key`.
    //
    // id: dphmlhdlikpnnegfejcebfieoegbjlop
    ...(firefox
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'subtitler-isolated@escaper01.github.io',
              // 140 is the first desktop release that understands
              // `data_collection_permissions` (142 on Android, below).
              strict_min_version: '140.0',
              // Firefox requires a declaration. Searches go to subtitlecat and TVmaze
              // because the user typed them and pressed Search; nothing else leaves the
              // browser, so "none" is the honest answer for what we *collect*.
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArsRKgoCHJxUqaqTivVbuwFmttCTB+vrAHYLvgN0duI0vWLgy69EwCNQgVqd3xkhHjb+g8zLewZ223+cWtMhS3K8ue6xTCl3wrfW/fWIizwoCMNtt/lCURBTMcZ+lb3WS9UmoZJ/fMZOkjduja5TPb+uaznkWNH6vObbxMyOKJ8tYIiicQcoQZZ7qrGmi/unnJ1m+YjD9RQIrU7xomPeNdOAE6SOCk7EFZxTcCMzIcC6FxYnn2Cx2dud0EJ3RPaYD+R264erm3Eyfatgvw1y9zpGPCa8tHHisOg5h9n+Giq0hE4Cm3dfwarnmC0Xa1QwzpANqfj85LIQ1toV3KzjWEwIDAQAB',
        }),

    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },

    // The action opens the popup, which is where sites are allowed. It has to be reachable
    // on a page the extension is *not* running on, so it cannot live in the in-page panel.
    action: {
      default_title: 'Subtitler',
      default_popup: 'src/popup/popup.html',
      default_icon: {
        16: 'icons/icon16.png',
        32: 'icons/icon32.png',
      },
    },

    // Entry basenames must stay unique across entry points. Rollup names output chunks
    // after the entry's basename, so two files both called `index.ts` collide and the
    // generated loader can end up importing the *content script* — which throws on
    // `window` in a worker and silently registers no message listener at all.
    background: firefox
      ? { scripts: ['src/background/service-worker.ts'], type: 'module' }
      : { service_worker: 'src/background/service-worker.ts', type: 'module' },

    content_scripts: [
      {
        // Injected everywhere, then gated at runtime against the user's allowlist — which is
        // checked against the *top* page's host, not the frame's. An allowlist expressed as
        // `matches` could not work: the film plays inside a cross-origin embed iframe whose
        // domain rotates and is not the domain anybody would think to allow.
        // See src/lib/sites.ts and CLAUDE.md.
        matches: ['<all_urls>'],
        all_frames: true,
        match_about_blank: true,
        run_at: 'document_start',
        js: ['src/content/content-script.ts'],
      },
    ],

    // `offscreen` (Chrome only): the worker has no DOM, so subtitlecat's HTML is parsed in
    // an offscreen document it opens for the purpose. See background/offscreen.ts.
    permissions: firefox ? ['storage', 'tabs'] : ['storage', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],

    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Toggle the Subtitler panel',
      },
    },
  };
});
