/**
 * Pin the extension's identity.
 *
 *   node tools/make-key.mjs
 *
 * An unpacked extension's id is derived from its public key, and without one Chrome
 * invents a fresh id every time it is loaded. That breaks the sign-in handoff, because the
 * website has to name a specific extension to send the token to — so the id has to be
 * fixed before any of that flow is written.
 *
 * Generates `key.pem` (once — it will not overwrite an existing one) and prints the two
 * things derived from it:
 *
 *   - the `key` value for the manifest. This is the PUBLIC half. It is safe in git; that
 *     is exactly what it is for.
 *   - the extension id, which the website needs as NEXT_PUBLIC_EXTENSION_ID.
 *
 * `key.pem` itself is the PRIVATE half and is git-ignored. **Back it up somewhere safe and
 * upload the same key to the Chrome Web Store.** Lose it, or let the Store generate its
 * own, and the published extension gets a different id from the one the site is
 * configured for — at which point sign-in works locally and silently fails in production.
 */

import { generateKeyPairSync, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../key.pem');

if (!existsSync(KEY_PATH)) {
  // 2048-bit RSA is what Chrome's own packaging produces.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(
    KEY_PATH,
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    { mode: 0o600 },
  );
  console.log(`generated ${KEY_PATH}`);
} else {
  console.log(`using existing ${KEY_PATH}`);
}

const { createPrivateKey, createPublicKey } = await import('node:crypto');
const publicDer = createPublicKey(createPrivateKey(readFileSync(KEY_PATH))).export({
  type: 'spki',
  format: 'der',
});

/**
 * Chrome's id derivation: the first 16 bytes of SHA-256 over the public key, with each hex
 * digit mapped onto a–p. It is not base16 and it is not base64 — it is its own thing.
 */
const digest = createHash('sha256').update(publicDer).digest('hex').slice(0, 32);
const id = [...digest].map((c) => 'abcdefghijklmnop'[Number.parseInt(c, 16)]).join('');

console.log('');
console.log('manifest key (public — safe to commit):');
console.log(publicDer.toString('base64'));
console.log('');
console.log(`extension id: ${id}`);
console.log('');
console.log('Put the id in web/.env as NEXT_PUBLIC_EXTENSION_ID, and keep key.pem safe —');
console.log('the Web Store listing must be signed with this same key.');
