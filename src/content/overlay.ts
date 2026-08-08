import type { Cue, SubtitleStyle, SubtitleTrack, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';
import { CueLookup } from '@/lib/subtitles/lookup';
import { DEFAULT_STYLE, subtitleCss } from '@/lib/style';
import { toCueTime } from '@/lib/sync';
import { log } from '@/lib/log';

/**
 * Draws subtitles on top of a <video>.
 *
 * Two things drive the design:
 *
 * 1. **Fullscreen.** Only descendants of `document.fullscreenElement` render. Rather than
 *    move the overlay when fullscreen changes, it is mounted inside the player's own
 *    container — whatever ancestor the site fullscreens, the overlay is already inside it.
 *    A fullscreenchange check remains as a fallback for players that do something unusual.
 *
 * 2. **Position against the picture, not the element.** A 16:9 video in a 4:3 box has black
 *    bars, and text placed relative to the element floats in the bar. The letterbox is
 *    derived from the intrinsic dimensions so text sits inside the image by default.
 */

const HOST_ID = 'subtitler-overlay-root';

/** Selectors for known player containers, best match first. */
const PLAYER_CONTAINERS = '.jwplayer, .video-js, .plyr, .shaka-video-container, [data-player], [class*="player"]';

/** Safety net for layout changes no observer reports (CSS transitions, sibling reflow). */
const LAYOUT_POLL_MS = 500;

export class SubtitleOverlay {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private cuesEl: HTMLDivElement | null = null;

  private video: HTMLVideoElement | null = null;
  private container: HTMLElement | null = null;

  private lookup: CueLookup | null = null;
  private track: SubtitleTrack | null = null;
  private sync: SyncState = IDENTITY_SYNC;
  private style: SubtitleStyle = DEFAULT_STYLE;

  private visible = true;
  /** Indices of the cues currently painted, to avoid rewriting the DOM every frame. */
  private paintedKey = '';
  private overlayHeight = 0;

  private resizeObserver: ResizeObserver | null = null;
  private layoutTimer: ReturnType<typeof setInterval> | null = null;
  private frameHandle: number | null = null;
  private usingVfc = false;
  private disposed = false;

  /* ----------------------------------------------------------------- lifecycle */

  attach(video: HTMLVideoElement): void {
    if (this.disposed || this.video === video) return;

    this.detachVideo();
    this.video = video;
    this.container = findPlayerContainer(video);

    this.build();
    this.mount();
    this.observeLayout();
    this.listenToVideo();
    this.updateLayout();
    this.render();
    this.schedule();

    log.info('overlay', 'attached', {
      container: describeElement(this.container),
      intrinsic: `${video.videoWidth}x${video.videoHeight}`,
    });
  }

  destroy(): void {
    this.disposed = true;
    this.detachVideo();
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.cuesEl = null;
    this.styleEl = null;
  }

  private detachVideo(): void {
    this.cancelFrame();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.layoutTimer !== null) {
      clearInterval(this.layoutTimer);
      this.layoutTimer = null;
    }

    if (this.video) {
      for (const event of VIDEO_EVENTS) this.video.removeEventListener(event, this.onVideoEvent);
    }
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
    window.removeEventListener('resize', this.onResize);

    this.video = null;
    this.container = null;
  }

  /* ---------------------------------------------------------------------- DOM */

  private build(): void {
    if (this.host) return;

    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    // Inline, and re-asserted on every layout pass, because sites have stylesheets that
    // would otherwise reach this element by tag or wildcard selectors.
    this.host.style.cssText =
      'position:absolute;pointer-events:none;z-index:2147483647;margin:0;padding:0;border:0;';

    this.shadow = this.host.attachShadow({ mode: 'open' });

    this.styleEl = document.createElement('style');
    this.cuesEl = document.createElement('div');
    this.cuesEl.className = 'cues';

    this.shadow.append(this.styleEl, this.cuesEl);
  }

  private mount(): void {
    if (!this.host) return;
    const parent = this.container ?? this.video?.parentElement ?? document.body;

    // Our absolute positioning needs the container to establish a containing block.
    if (parent !== document.body && getComputedStyle(parent).position === 'static') {
      (parent as HTMLElement).style.position = 'relative';
    }

    if (this.host.parentElement !== parent) parent.appendChild(this.host);
  }

  /* ------------------------------------------------------------------- layout */

  private observeLayout(): void {
    this.resizeObserver = new ResizeObserver(() => this.updateLayout());
    if (this.video) this.resizeObserver.observe(this.video);
    if (this.container) this.resizeObserver.observe(this.container);

    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);

    this.layoutTimer = setInterval(() => this.updateLayout(), LAYOUT_POLL_MS);
  }

  private onResize = () => this.updateLayout();

  private onFullscreenChange = () => {
    const fsElement = document.fullscreenElement;

    // Normally a no-op: the overlay is inside the player container, which is what goes
    // fullscreen. This only matters for players that fullscreen something else.
    if (fsElement && this.host && !fsElement.contains(this.host)) {
      if (fsElement === this.video) {
        log.warn('overlay', 'the <video> element itself went fullscreen; nothing can be drawn over it');
      } else {
        log.info('overlay', 'reparenting overlay into the fullscreen element');
        fsElement.appendChild(this.host);
        if (getComputedStyle(fsElement).position === 'static') {
          (fsElement as HTMLElement).style.position = 'relative';
        }
      }
    }

    // Fullscreen transitions animate, so one measurement now is not enough.
    this.updateLayout();
    setTimeout(() => this.updateLayout(), 120);
    setTimeout(() => this.updateLayout(), 400);
  };

  /**
   * Size and place the overlay over the video's picture.
   *
   * Everything is expressed relative to the container, so the overlay does not care where
   * the container itself is on the page — only page-relative geometry would need scroll
   * compensation, and absolute positioning inside the container avoids that entirely.
   */
  private updateLayout(): void {
    if (!this.host || !this.video) return;

    const parent = this.host.parentElement;
    if (!parent) return;

    const videoRect = this.video.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    if (videoRect.width === 0 || videoRect.height === 0) {
      this.host.style.display = 'none';
      return;
    }
    this.host.style.display = '';

    let left = videoRect.left - parentRect.left + parent.scrollLeft;
    let top = videoRect.top - parentRect.top + parent.scrollTop;
    let width = videoRect.width;
    let height = videoRect.height;

    if (this.style.anchorTo === 'picture') {
      const inset = letterbox(this.video, videoRect.width, videoRect.height);
      left += inset.x;
      top += inset.y;
      width = inset.width;
      height = inset.height;
    }

    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.width = `${width}px`;
    this.host.style.height = `${height}px`;

    // Font sizes are a percentage of overlay height, so the CSS is height-dependent.
    if (Math.abs(height - this.overlayHeight) > 0.5) {
      this.overlayHeight = height;
      this.applyStyle();
    }
  }

  /* -------------------------------------------------------------------- state */

  setTrack(track: SubtitleTrack | null): void {
    this.track = track;
    this.lookup = track ? new CueLookup(track.cues) : null;
    this.paintedKey = '';
    this.render();
  }

  getTrack(): SubtitleTrack | null {
    return this.track;
  }

  setSync(sync: SyncState): void {
    this.sync = sync;
    this.paintedKey = '';
    this.render();
  }

  setStyle(style: SubtitleStyle): void {
    this.style = style;
    this.applyStyle();
    this.updateLayout();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.paintedKey = '';
    this.render();
  }

  private applyStyle(): void {
    if (!this.styleEl) return;
    this.styleEl.textContent = `
      :host { all: initial; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      ${subtitleCss(this.style, this.overlayHeight || 360)}
    `;
  }

  /* ------------------------------------------------------------------ playback */

  private listenToVideo(): void {
    if (!this.video) return;
    for (const event of VIDEO_EVENTS) this.video.addEventListener(event, this.onVideoEvent);
  }

  /**
   * Keep the display correct when no frames are being presented.
   *
   * requestVideoFrameCallback only fires for newly presented frames, so while paused it is
   * silent — but the user can still seek, and the sync tool changes the offset while
   * paused. These events cover exactly those cases.
   */
  private onVideoEvent = (event: Event): void => {
    if (event.type === 'emptied' || event.type === 'loadedmetadata') this.updateLayout();
    this.render();
    this.schedule();
  };

  private schedule(): void {
    this.cancelFrame();
    if (this.disposed || !this.video) return;

    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this.usingVfc = true;
      this.frameHandle = this.video.requestVideoFrameCallback(this.onFrame);
    } else {
      this.usingVfc = false;
      this.frameHandle = requestAnimationFrame(() => this.onFrame(0));
    }
  }

  private cancelFrame(): void {
    if (this.frameHandle === null) return;
    if (this.usingVfc) this.video?.cancelVideoFrameCallback?.(this.frameHandle);
    else cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private onFrame = (_now: number, metadata?: { mediaTime: number }): void => {
    this.frameHandle = null;
    // mediaTime is the presentation time of the frame on screen right now, which is more
    // accurate than currentTime (that can run slightly ahead of what is displayed).
    this.render(metadata?.mediaTime);
    this.schedule();
  };

  private render(mediaTime?: number): void {
    if (!this.cuesEl || !this.video) return;

    const active =
      this.visible && this.lookup
        ? this.lookup.findActive(toCueTime(mediaTime ?? this.video.currentTime, this.sync))
        : [];

    const key = active.map((cue) => cue.index).join(',');
    if (key === this.paintedKey) return;
    this.paintedKey = key;
    this.paint(active);
  }

  private paint(cues: Cue[]): void {
    const target = this.cuesEl;
    if (!target) return;

    target.replaceChildren(
      ...cues.map((cue) => {
        const element = document.createElement('div');
        element.className = 'cue';
        // textContent, never innerHTML: cue text comes from a user-supplied file, and
        // `white-space: pre-wrap` already renders the newlines.
        element.textContent = cue.lines.join('\n');
        return element;
      }),
    );
  }

  /**
   * The element the overlay was mounted into. The panel mounts into the same one, so that
   * both are inside whatever the site puts into fullscreen.
   */
  get mountContainer(): HTMLElement | null {
    return this.host?.parentElement ?? this.container;
  }

  /** Current playback position, for the sync tool. */
  get currentTime(): number {
    return this.video?.currentTime ?? 0;
  }

  get duration(): number {
    const duration = this.video?.duration ?? 0;
    return Number.isFinite(duration) ? duration : 0;
  }
}

const VIDEO_EVENTS = [
  'seeked',
  'seeking',
  'play',
  'pause',
  'timeupdate',
  'ratechange',
  'loadedmetadata',
  'emptied',
] as const;

/**
 * The rectangle the picture actually occupies inside the element, accounting for the
 * letterbox bars produced by `object-fit: contain` (the default for <video>).
 */
function letterbox(
  video: HTMLVideoElement,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number; width: number; height: number } {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }

  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;

  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/**
 * The element to mount inside: the player's own container, so that whatever the site puts
 * into fullscreen already contains us.
 */
function findPlayerContainer(video: HTMLVideoElement): HTMLElement | null {
  const known = video.closest<HTMLElement>(PLAYER_CONTAINERS);
  if (known) return known;

  // Otherwise walk up to the nearest ancestor that is meaningfully larger than the video
  // itself — that is almost always the player chrome.
  let node = video.parentElement;
  let hops = 0;
  while (node && hops < 4) {
    const style = getComputedStyle(node);
    if (style.position !== 'static' || node.clientHeight >= video.clientHeight) return node;
    node = node.parentElement;
    hops++;
  }
  return video.parentElement;
}

function describeElement(element: Element | null): string {
  if (!element) return '(none)';
  const id = element.id ? `#${element.id}` : '';
  const cls = element.className && typeof element.className === 'string'
    ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${element.tagName.toLowerCase()}${id}${cls}`;
}
