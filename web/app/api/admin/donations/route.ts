import { fail, json } from '@/lib/api';
import { safeLabel, safeProvider, safeUrl } from '@/lib/donate';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** More than anybody should have, and a bound on what one request can write. */
const MAX_LINKS = 12;

/**
 * `POST /api/admin/donations` — the whole list of donation buttons, in one write.
 *
 * The client sends the complete list rather than one row at a time, because reordering and
 * deleting are the common edits and both are awkward as individual calls. Rows carrying an
 * `id` are updated, rows without one are created, and **any row missing from the payload is
 * deleted** — so the list in the form is the list in the database, with no partial states
 * to reconcile.
 *
 * The whole thing runs in one transaction. A half-applied reorder would leave two links
 * claiming the same position, which is exactly the kind of thing nobody notices until the
 * public page renders it.
 *
 * `safeUrl` is applied here and again on read. Validating on the way in is what stops a
 * bad row existing; validating on the way out is what stops one that already does from
 * reaching the extension. Both, because these URLs are rendered inside other people's
 * pages.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const rows = (body as { links?: unknown })?.links;
  if (!Array.isArray(rows)) return fail('Send a list of links', 400);
  if (rows.length > MAX_LINKS) return fail(`At most ${MAX_LINKS} links`, 400);

  const parsed: Array<{
    id: string | null;
    provider: string;
    label: string;
    url: string;
    visible: boolean;
    sortOrder: number;
  }> = [];

  for (const [index, raw] of rows.entries()) {
    const row = (raw ?? {}) as Record<string, unknown>;

    const label = safeLabel(typeof row.label === 'string' ? row.label : '');
    if (!label) return fail(`Link ${index + 1} needs a label`, 400);

    const url = safeUrl(typeof row.url === 'string' ? row.url : '');
    if (!url) return fail(`The link for "${label}" must be a http or https URL`, 400);

    parsed.push({
      id: typeof row.id === 'string' && row.id ? row.id : null,
      provider: safeProvider(typeof row.provider === 'string' ? row.provider : ''),
      label,
      url,
      visible: row.visible !== false,
      // Position comes from the order they arrived in, not from a number the client sends
      // — the form reorders by moving rows, and two rows cannot then claim one slot.
      sortOrder: index,
    });
  }

  const keep = parsed.map((row) => row.id).filter((id): id is string => id !== null);

  try {
    await db.$transaction([
      db.donationLink.deleteMany({
        where: keep.length > 0 ? { id: { notIn: keep } } : {},
      }),
      ...parsed.map((row) =>
        row.id
          ? db.donationLink.update({
              where: { id: row.id },
              data: {
                provider: row.provider,
                label: row.label,
                url: row.url,
                visible: row.visible,
                sortOrder: row.sortOrder,
              },
            })
          : db.donationLink.create({
              data: {
                provider: row.provider,
                label: row.label,
                url: row.url,
                visible: row.visible,
                sortOrder: row.sortOrder,
              },
            }),
      ),
    ]);
  } catch (err) {
    console.error('[admin/donations] could not save', err);
    return fail('Could not save that. The list is unchanged.', 500);
  }

  return json({ ok: true });
}
