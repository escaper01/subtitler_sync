import type { DebugSnapshot, FrameReport, LogEvent, NetEntry, VideoReport } from '@/types';
import { maskUrl } from '@/lib/url';
import { classifyHost } from '@/hosts';

/**
 * Render a snapshot as one markdown block, suitable for pasting into a bug report.
 *
 * Secrets are masked by default: the signed CDN URLs carry short-lived tokens, and a
 * report is meant to be shared.
 */
export function buildMarkdownReport(
  snapshot: DebugSnapshot,
  options: { mask?: boolean; limit?: number } = {},
): string {
  const mask = options.mask ?? true;
  const limit = options.limit ?? 50;
  const url = (u: string) => (mask ? maskUrl(u) : u);

  const out: string[] = [];
  out.push('## Subtitler debug report');
  out.push('');
  out.push(`- extension version: \`${snapshot.version}\``);
  out.push(`- generated: ${new Date(snapshot.generatedAt).toISOString()}`);
  out.push(`- tab: ${snapshot.tabId ?? '(none)'} — ${snapshot.tabUrl ? url(snapshot.tabUrl) : '(unknown)'}`);
  out.push(`- secrets masked: ${mask ? 'yes' : 'NO — this report contains tokens'}`);
  out.push('');

  out.push(`### Frames (${snapshot.frames.length} reporting, ${snapshot.silentFrames.length} silent)`);
  out.push('');
  if (snapshot.frames.length === 0) {
    out.push('_No frame reported in. The content script did not run anywhere in this tab._');
  }
  for (const frame of snapshot.frames) {
    out.push(describeFrame(frame, url));
  }
  out.push('');

  if (snapshot.silentFrames.length > 0) {
    out.push('**Silent frames** (Chrome knows about them, but no content script checked in):');
    out.push('');
    for (const frame of snapshot.silentFrames) {
      out.push(`- frame ${frame.frameId} (parent ${frame.parentFrameId}) — ${url(frame.url)}`);
    }
    out.push('');
  }

  const events = snapshot.events.slice(-limit);
  out.push(`### Events (last ${events.length})`);
  out.push('');
  out.push('```');
  for (const event of events) out.push(formatEvent(event));
  if (events.length === 0) out.push('(none)');
  out.push('```');
  out.push('');

  const media = snapshot.net.filter((entry) => entry.media).slice(-limit);
  out.push(`### Media requests (last ${media.length})`);
  out.push('');
  out.push('```');
  for (const entry of media) out.push(formatNet(entry, url));
  if (media.length === 0) out.push('(none)');
  out.push('```');

  return out.join('\n');
}

function describeFrame(frame: FrameReport, url: (u: string) => string): string {
  const lines: string[] = [];
  const kind = classifyHost(frame.url);
  const tags = [
    frame.isTop ? 'top' : `child of ${frame.parentFrameId}`,
    kind !== 'unknown' ? `known ${kind} host` : null,
    frame.hasPanel ? 'hosts panel' : null,
  ].filter(Boolean);

  lines.push(`**frame ${frame.frameId}** (${tags.join(', ')}) — ${url(frame.url)}`);

  if (frame.videos.length === 0) {
    lines.push('  - no <video> elements');
  }
  for (const video of frame.videos) {
    lines.push(`  - ${describeVideo(video)}`);
  }
  return lines.join('\n');
}

function describeVideo(video: VideoReport): string {
  const state = [
    `readyState=${video.readyState}`,
    `duration=${video.duration < 0 ? 'unknown' : `${video.duration.toFixed(1)}s`}`,
    `t=${video.currentTime.toFixed(2)}s`,
    video.paused ? 'paused' : 'playing',
    video.muted ? 'muted' : null,
    `${video.videoWidth}x${video.videoHeight}`,
    `rect=${video.rect.w}x${video.rect.h}`,
  ]
    .filter(Boolean)
    .join(' ');

  const status = video.active ? '**ACTIVE**' : video.rejectedReason ? `skipped: ${video.rejectedReason}` : 'idle';
  return `\`${video.id}\` ${status} — ${video.src} — ${state}`;
}

function formatEvent(event: LogEvent): string {
  const time = new Date(event.t).toISOString().slice(11, 23);
  const frame = event.frameId === undefined ? '' : ` f${event.frameId}`;
  const data = event.data === undefined ? '' : ` ${JSON.stringify(event.data)}`;
  return `${time} ${event.level.toUpperCase().padEnd(5)}${frame} [${event.scope}] ${event.message}${data}`;
}

function formatNet(entry: NetEntry, url: (u: string) => string): string {
  const time = new Date(entry.t).toISOString().slice(11, 19);
  const outcome = entry.error ? `ERR ${entry.error}` : entry.status ? String(entry.status) : '...';
  return `${time} ${outcome.padEnd(6)} ${entry.type.padEnd(14)} f${entry.frameId} ${url(entry.url)}`;
}
