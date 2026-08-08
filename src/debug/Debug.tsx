import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DebugSnapshot, LogEvent, NetEntry } from '@/types';
import { askBackground } from '@/lib/messaging';
import { maskUrl } from '@/lib/url';
import { classifyHost } from '@/hosts';
import { buildMarkdownReport } from '@/debug/report';

type TabInfo = { id: number; title: string; url: string };
type NetFilter = 'media' | 'requests' | 'all';

export function Debug() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [tabId, setTabId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [mask, setMask] = useState(true);
  const [filter, setFilter] = useState<NetFilter>('media');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await askBackground<DebugSnapshot>({
      kind: 'debug:get-snapshot',
      ...(tabId !== null ? { tabId } : {}),
    });
    if (next) {
      setSnapshot(next);
      if (tabId === null && next.tabId !== null) setTabId(next.tabId);
    }
    setLoading(false);
  }, [tabId]);

  useEffect(() => {
    void askBackground<TabInfo[]>({ kind: 'debug:list-tabs' }).then((list) => setTabs(list ?? []));
  }, [snapshot?.generatedAt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [auto, refresh]);

  const copyReport = async () => {
    if (!snapshot) return;
    await navigator.clipboard.writeText(buildMarkdownReport(snapshot, { mask }));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadJson = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitler-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = async () => {
    await askBackground({ kind: 'debug:clear' });
    void refresh();
  };

  return (
    <div className="min-h-screen p-5 font-sans text-sm">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-white">Subtitler debug</h1>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
          v{snapshot?.version ?? '—'}
        </span>

        <select
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
          value={tabId ?? ''}
          onChange={(e) => setTabId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">(active tab)</option>
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.id} — {tab.title.slice(0, 60) || tab.url.slice(0, 60)}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <Toggle checked={auto} onChange={setAuto} label="auto-refresh" />
          <Toggle checked={mask} onChange={setMask} label="mask tokens" />
          <Button onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button onClick={() => void copyReport()} primary>
            {copied ? 'Copied ✓' : 'Copy report'}
          </Button>
          <Button onClick={downloadJson}>Download JSON</Button>
          <Button onClick={() => void clear()}>Clear</Button>
        </div>
      </header>

      {!mask && (
        <p className="mb-3 rounded border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          Tokens are unmasked. The <code>t</code>/<code>s</code>/<code>e</code> query parameters are
          short-lived credentials — don't paste this report anywhere public.
        </p>
      )}

      <Frames snapshot={snapshot} mask={mask} />
      <Events events={snapshot?.events ?? []} />
      <Network entries={snapshot?.net ?? []} filter={filter} onFilter={setFilter} mask={mask} />
    </div>
  );
}

/* ---------------------------------------------------------------------- frames */

function Frames({ snapshot, mask }: { snapshot: DebugSnapshot | null; mask: boolean }) {
  const show = (u: string) => (mask ? maskUrl(u) : u);

  return (
    <Section
      title="Frames"
      subtitle={
        snapshot
          ? `${snapshot.frames.length} reporting, ${snapshot.silentFrames.length} silent`
          : 'loading…'
      }
    >
      {snapshot && snapshot.frames.length === 0 && (
        <p className="text-neutral-500">
          No frame reported in. The content script did not run anywhere in this tab — check that
          the extension is enabled and that the page has been reloaded since it was last built.
        </p>
      )}

      <div className="space-y-2">
        {snapshot?.frames.map((frame) => {
          const kind = classifyHost(frame.url);
          return (
            <div key={frame.frameId} className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
                  frame {frame.frameId}
                </span>
                <span className="text-xs text-neutral-500">
                  {frame.isTop ? 'top frame' : `child of ${frame.parentFrameId}`}
                </span>
                {kind !== 'unknown' && <Tag>{kind} host</Tag>}
                {frame.hasPanel && <Tag tone="violet">panel</Tag>}
                {frame.videos.some((v) => v.active) && <Tag tone="emerald">video</Tag>}
              </div>

              <div className="mt-1 break-all font-mono text-xs text-neutral-500">{show(frame.url)}</div>

              {frame.videos.length === 0 ? (
                <div className="mt-2 text-xs text-neutral-600">no &lt;video&gt; elements</div>
              ) : (
                <table className="mt-2 w-full text-left font-mono text-xs">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="pr-3 font-normal">id</th>
                      <th className="pr-3 font-normal">state</th>
                      <th className="pr-3 font-normal">src</th>
                      <th className="pr-3 font-normal">ready</th>
                      <th className="pr-3 font-normal">duration</th>
                      <th className="pr-3 font-normal">time</th>
                      <th className="pr-3 font-normal">intrinsic</th>
                      <th className="pr-3 font-normal">rect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frame.videos.map((video) => (
                      <tr key={video.id} className={video.active ? 'text-emerald-300' : 'text-neutral-400'}>
                        <td className="pr-3">{video.id}</td>
                        <td className="pr-3">
                          {video.active ? 'ACTIVE' : video.rejectedReason ? 'skipped' : 'idle'}
                        </td>
                        <td className="max-w-[22ch] truncate pr-3" title={video.src}>
                          {video.src}
                        </td>
                        <td className="pr-3">{video.readyState}</td>
                        <td className="pr-3">
                          {video.duration < 0 ? '—' : `${video.duration.toFixed(1)}s`}
                        </td>
                        <td className="pr-3">
                          {video.currentTime.toFixed(2)}s {video.paused ? '⏸' : '▶'}
                        </td>
                        <td className="pr-3">
                          {video.videoWidth}×{video.videoHeight}
                        </td>
                        <td className="pr-3">
                          {video.rect.w}×{video.rect.h}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {frame.videos
                .filter((v) => v.rejectedReason)
                .map((v) => (
                  <div key={`${v.id}-why`} className="mt-1 text-xs text-amber-400/80">
                    {v.id}: {v.rejectedReason}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {snapshot && snapshot.silentFrames.length > 0 && (
        <div className="mt-3 rounded border border-neutral-800 bg-neutral-900/40 p-3">
          <div className="mb-1 text-xs font-medium text-neutral-400">
            Silent frames — Chrome knows about these, but no content script checked in
          </div>
          {snapshot.silentFrames.map((frame) => (
            <div key={frame.frameId} className="break-all font-mono text-xs text-neutral-500">
              f{frame.frameId} (parent {frame.parentFrameId}) {show(frame.url)}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------------------------------------------------------------------- events */

function Events({ events }: { events: LogEvent[] }) {
  const bottom = useRef<HTMLDivElement>(null);
  const recent = useMemo(() => events.slice(-200), [events]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [recent.length]);

  const tone: Record<string, string> = {
    error: 'text-red-400',
    warn: 'text-amber-400',
    info: 'text-neutral-300',
    debug: 'text-neutral-500',
  };

  return (
    <Section title="Events" subtitle={`${events.length} buffered`}>
      <div className="max-h-72 overflow-auto rounded border border-neutral-800 bg-black/40 p-2 font-mono text-xs">
        {recent.length === 0 && <div className="text-neutral-600">(none)</div>}
        {recent.map((event, i) => (
          <div key={`${event.t}-${i}`} className={tone[event.level] ?? 'text-neutral-400'}>
            <span className="text-neutral-600">{new Date(event.t).toISOString().slice(11, 23)}</span>{' '}
            {event.frameId !== undefined && <span className="text-neutral-600">f{event.frameId} </span>}
            <span className="text-neutral-500">[{event.scope}]</span> {event.message}
            {event.data !== undefined && (
              <span className="text-neutral-600"> {JSON.stringify(event.data)}</span>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------------- network */

function Network({
  entries,
  filter,
  onFilter,
  mask,
}: {
  entries: NetEntry[];
  filter: NetFilter;
  onFilter: (f: NetFilter) => void;
  mask: boolean;
}) {
  const shown = useMemo(() => {
    const matches = (entry: NetEntry) => {
      if (filter === 'all') return true;
      if (filter === 'media') return entry.media;
      return entry.type === 'xmlhttprequest' || entry.type === 'fetch' || entry.media;
    };
    return entries.filter(matches).slice(-300).reverse();
  }, [entries, filter]);

  const show = (u: string) => (mask ? maskUrl(u) : u);

  return (
    <Section title="Network" subtitle={`${shown.length} shown of ${entries.length}`}>
      <div className="mb-2 flex gap-1">
        {(['media', 'requests', 'all'] as const).map((option) => (
          <button
            key={option}
            onClick={() => onFilter(option)}
            className={`rounded px-2 py-0.5 text-xs ${
              filter === option
                ? 'bg-neutral-200 text-neutral-900'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="max-h-96 overflow-auto rounded border border-neutral-800 bg-black/40">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 bg-neutral-900 text-neutral-500">
            <tr>
              <th className="px-2 py-1 font-normal">time</th>
              <th className="px-2 py-1 font-normal">status</th>
              <th className="px-2 py-1 font-normal">type</th>
              <th className="px-2 py-1 font-normal">frame</th>
              <th className="px-2 py-1 font-normal">url</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-neutral-600">
                  (none)
                </td>
              </tr>
            )}
            {shown.map((entry) => (
              <tr key={entry.id} className="border-t border-neutral-900 hover:bg-neutral-900/60">
                <td className="whitespace-nowrap px-2 py-0.5 text-neutral-600">
                  {new Date(entry.t).toISOString().slice(11, 19)}
                </td>
                <td
                  className={`px-2 py-0.5 ${
                    entry.error
                      ? 'text-red-400'
                      : entry.status && entry.status >= 400
                        ? 'text-amber-400'
                        : 'text-neutral-400'
                  }`}
                >
                  {entry.error ? 'ERR' : (entry.status ?? '…')}
                </td>
                <td className="px-2 py-0.5 text-neutral-500">{entry.type}</td>
                <td className="px-2 py-0.5 text-neutral-600">f{entry.frameId}</td>
                <td className="px-2 py-0.5 break-all text-neutral-400" title={show(entry.url)}>
                  {show(entry.url)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ primitives */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-white">
        {title}
        {subtitle && <span className="text-xs font-normal text-neutral-500">{subtitle}</span>}
      </h2>
      {children}
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2.5 py-1 text-xs disabled:opacity-50 ${
        primary
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : 'border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-emerald-500"
      />
      {label}
    </label>
  );
}

function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    neutral: 'bg-neutral-800 text-neutral-400',
    emerald: 'bg-emerald-900/60 text-emerald-300',
    violet: 'bg-violet-900/60 text-violet-300',
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
