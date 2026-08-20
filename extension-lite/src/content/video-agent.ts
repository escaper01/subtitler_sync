import { log } from '@/lib/log';

/**
 * Finds the <video> element that is actually the film, in whatever frame this script is
 * running in.
 *
 * The player is created late by JW Player and its element is swapped out on quality
 * changes, so detection is event-driven rather than a one-time query. Three redundant
 * hooks feed the same evaluation path:
 *
 *   1. a capture-phase 'play' listener on the document — catches any media element,
 *      including ones that did not exist when we started. This is the primary hook.
 *   2. a MutationObserver for added <video> nodes — catches the post-quality-switch
 *      element even if it never fires 'play' again.
 *   3. periodic sweeps early in the page's life — catches anything already present at
 *      document_start.
 */

/** Ads and prerolls are short; the film is not. Videos below this are ignored. */
const MIN_DURATION_S = 90;

/** How long to keep sweeping for a video after the script starts. */
const SWEEP_WINDOW_MS = 30_000;
const SWEEP_INTERVAL_MS = 1_000;

export type RejectReason =
  | 'metadata-pending'
  | 'too-short'
  | 'not-rendered'
  | 'smaller-candidate';

/** Why a candidate was passed over. Only ever surfaces in the console log. */
const REJECT_TEXT: Record<RejectReason, string> = {
  'metadata-pending': 'waiting for metadata (duration unknown)',
  'too-short': `duration below ${MIN_DURATION_S}s — looks like an ad or preroll`,
  'not-rendered': 'zero-size or hidden',
  'smaller-candidate': 'another video on this page is larger',
};

let nextId = 1;
const videoIds = new WeakMap<HTMLVideoElement, string>();

function idOf(video: HTMLVideoElement): string {
  let id = videoIds.get(video);
  if (!id) {
    id = `v${nextId++}`;
    videoIds.set(video, id);
  }
  return id;
}

function area(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

/**
 * Decide whether a video could be the film. Returns null when acceptable, otherwise the
 * reason it was skipped (surfaced in the debug frame tree).
 */
function evaluate(video: HTMLVideoElement): RejectReason | null {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return 'metadata-pending';
  if (video.duration < MIN_DURATION_S) return 'too-short';
  if (area(video) <= 0) return 'not-rendered';
  return null;
}

export interface VideoAgentOptions {
  /** Called when the film video changes (including to null when it goes away). */
  onActiveChange: (video: HTMLVideoElement | null) => void;
  /** Called once, the first time any <video> at all is seen in this frame. */
  onFirstVideoSeen?: () => void;
}

export class VideoAgent {
  private active: HTMLVideoElement | null = null;
  /** Videos already considered, so repeat sweeps don't re-log the same rejection. */
  private seen = new WeakSet<HTMLVideoElement>();
  private seenCount = 0;
  private observer: MutationObserver | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = Date.now();
  /** Videos we've already subscribed to metadata events for, to avoid duplicate listeners. */
  private watched = new WeakSet<HTMLVideoElement>();
  private disposed = false;

  constructor(private options: VideoAgentOptions) {}

  get activeVideo(): HTMLVideoElement | null {
    return this.active;
  }

  start(): void {
    // 1. Any media element starting playback anywhere in this document.
    document.addEventListener('play', this.onPlay, true);

    // 2. Elements added later (JW Player builds its DOM after our document_start run).
    this.observer = new MutationObserver(this.onMutations);
    const observeRoot = () => {
      if (this.disposed) return;
      if (document.documentElement) {
        this.observer?.observe(document.documentElement, { childList: true, subtree: true });
      }
    };
    if (document.documentElement) observeRoot();
    else document.addEventListener('DOMContentLoaded', observeRoot, { once: true });

    // 3. Anything already in the DOM.
    this.sweep();
    document.addEventListener('DOMContentLoaded', () => this.sweep(), { once: true });
    this.sweepTimer = setInterval(() => {
      if (Date.now() - this.startedAt > SWEEP_WINDOW_MS && this.active) this.stopSweeping();
      else this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('play', this.onPlay, true);
    this.observer?.disconnect();
    this.observer = null;
    this.stopSweeping();
  }

  private stopSweeping(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private onPlay = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLVideoElement) this.consider(target, 'play');
  };

  private onMutations = (records: MutationRecord[]): void => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLVideoElement) this.consider(node, 'added');
        else if (node instanceof Element) {
          for (const video of node.querySelectorAll('video')) this.consider(video, 'added');
        }
      }
      for (const node of record.removedNodes) {
        if (node === this.active || (node instanceof Element && this.active && node.contains(this.active))) {
          this.handleActiveRemoved();
        }
      }
    }
  };

  private sweep(): void {
    for (const video of document.querySelectorAll('video')) this.consider(video, 'sweep');
  }

  /**
   * Consider a video as the film. Videos without metadata yet are subscribed to and
   * re-considered once the browser knows their duration.
   */
  private consider(video: HTMLVideoElement, via: string): void {
    if (this.disposed) return;

    const isNew = !this.seen.has(video);
    if (isNew) {
      this.seen.add(video);
      if (++this.seenCount === 1) this.options.onFirstVideoSeen?.();
    }

    const reason = evaluate(video);

    if (reason === 'metadata-pending') {
      this.watchForMetadata(video);
      if (isNew) log.debug('detect', `saw video (${via}), waiting for metadata`, { id: idOf(video) });
      return;
    }

    if (reason !== null) {
      if (isNew) log.debug('detect', `skipped video (${via}): ${REJECT_TEXT[reason]}`, { id: idOf(video) });
      return;
    }

    if (this.active === video) return;

    // Prefer the larger video when a page has several plausible ones (a trailer next to
    // the film, for example).
    if (this.active && document.contains(this.active) && area(this.active) >= area(video)) {
      log.debug('detect', `skipped video (${via}): ${REJECT_TEXT['smaller-candidate']}`, {
        id: idOf(video),
      });
      return;
    }

    this.setActive(video, via);
  }

  private watchForMetadata(video: HTMLVideoElement): void {
    if (this.watched.has(video)) return;
    this.watched.add(video);
    const recheck = () => this.consider(video, 'metadata');
    video.addEventListener('loadedmetadata', recheck);
    video.addEventListener('durationchange', recheck);
    video.addEventListener('playing', recheck);
  }

  private setActive(video: HTMLVideoElement, via: string): void {
    this.active = video;
    log.info('detect', `attached to video via ${via}`, {
      id: idOf(video),
      duration: Math.round(video.duration),
      size: `${video.videoWidth}x${video.videoHeight}`,
      src: describeSrc(video.currentSrc || video.src),
    });
    this.options.onActiveChange(video);
  }

  /**
   * The active element was pulled out of the DOM — typically a quality switch, where the
   * player destroys the <video> and builds a new one. Drop it and let detection re-run.
   */
  private handleActiveRemoved(): void {
    log.info('detect', 'active video removed from the DOM; re-detecting');
    this.active = null;
    this.options.onActiveChange(null);
    this.startedAt = Date.now();
    if (this.sweepTimer === null) {
      this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    }
    queueMicrotask(() => this.sweep());
  }

  /** Force attachment to a specific video, bypassing the heuristics (used by the panel). */
  attachTo(video: HTMLVideoElement): void {
    this.seen.add(video);
    this.setActive(video, 'manual');
  }
}

/**
 * A `blob:` URL is an opaque handle into this frame's heap — it identifies nothing outside
 * it and is not worth logging in full. Keep the scheme and a short tail for correlation.
 */
function describeSrc(src: string): string {
  if (!src) return '(no src)';
  if (src.startsWith('blob:')) return `blob:…${src.slice(-12)} (MSE)`;
  if (src.length > 120) return `${src.slice(0, 100)}…`;
  return src;
}
