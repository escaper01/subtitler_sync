import { requireUser } from '@/lib/requireUser';
import { appFail, appJson } from '@/lib/appApi';
import { recordDeviceSignal } from '@/lib/deviceSignal';
import { hashIp } from '@/lib/searchLog';

/**
 * Records the device a signed-in customer is using.
 *
 * Called once by the account page after sign-in. Everything here arrives from the client
 * and is therefore untrusted: the account it is attributed to comes from the session, never
 * from the body, so a caller can only ever report a device against themselves.
 *
 * A failure is not surfaced to the user. This is anti-abuse telemetry, and someone whose
 * browser blocks the fingerprint — or who simply denies it — should still have a working
 * account. Returning success either way also means the response reveals nothing about
 * whether the signal was accepted.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireUser();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return appFail('Malformed request', 400);
  }

  const payload = body as Record<string, unknown> | null;
  const visitorId = typeof payload?.visitorId === 'string' ? payload.visitorId.trim() : '';

  // Nothing to key on without it, and an empty string would collide every blocked browser
  // into one shared "device".
  if (visitorId.length < 8 || visitorId.length > 128) {
    return appJson({ ok: true });
  }

  try {
    await recordDeviceSignal(
      gate.user.id,
      {
        visitorId,
        timezone: asString(payload?.timezone),
        screen: asString(payload?.screen),
        platform: asString(payload?.platform),
        languages: asString(payload?.languages),
      },
      hashIp(request),
    );
  } catch (err) {
    console.error('[account] could not record the device signal', err);
  }

  return appJson({ ok: true });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
