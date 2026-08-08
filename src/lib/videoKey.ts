/**
 * A stable identity for "the thing being watched", used to remember a subtitle file and
 * its sync offset across visits.
 *
 * The panel runs in the frame that owns the video, which on these sites is the embed page
 * — `dr0pstream.com/embed-ug1kp4s9rp8m.html`. That path already contains a per-episode id,
 * which makes it a better key than anything we could derive from the top page (which is
 * cross-origin and unreadable from here anyway).
 *
 * Duration is deliberately *not* part of the key. It would add nothing — the path is
 * already unique per episode — while risking a silent cache miss if a different quality
 * stream reports a duration a fraction of a second apart.
 */
export function videoKey(): string {
  try {
    const url = new URL(location.href);
    return `${url.host}${url.pathname}`;
  } catch {
    return location.href.slice(0, 200);
  }
}

/** A human-readable label for the panel's "remembered for…" line. */
export function videoLabel(): string {
  try {
    const url = new URL(location.href);
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : url.host;
  } catch {
    return 'this video';
  }
}
