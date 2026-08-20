import type { DualLayout, SubtitleStyle } from '@/types';

/**
 * Subtitle appearance.
 *
 * Sizes are percentages of the overlay's height rather than pixels, so text keeps its
 * proportions when the player goes from a small embed to fullscreen. The overlay converts
 * them to pixels each time it measures itself.
 */

export const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  fontSizePct: 5.2,
  fontWeight: 600,
  color: '#ffffff',
  opacity: 1,
  outlineWidth: 2,
  outlineColor: '#000000',
  shadow: true,
  bgColor: '#000000',
  bgAlpha: 0,
  bgPadding: 0.4,
  bgRadius: 4,
  bottomPct: 7,
  maxWidthPct: 88,
  lineHeight: 1.25,
  textAlign: 'center',
  uppercase: false,
  letterSpacing: 0,
  anchorTo: 'picture',
};

export const STYLE_PRESETS: { name: string; description: string; style: SubtitleStyle }[] = [
  {
    name: 'Outline',
    description: 'White text with a black outline. Readable over anything.',
    style: DEFAULT_STYLE,
  },
  {
    name: 'Boxed',
    description: 'Translucent black box behind the text, like broadcast subtitles.',
    style: {
      ...DEFAULT_STYLE,
      outlineWidth: 0,
      shadow: false,
      bgAlpha: 0.72,
      bgPadding: 0.6,
      fontWeight: 500,
    },
  },
  {
    name: 'Classic yellow',
    description: 'Yellow with a heavy outline, the way DVD subtitles looked.',
    style: {
      ...DEFAULT_STYLE,
      color: '#f5d90a',
      outlineWidth: 3,
      fontWeight: 700,
    },
  },
];

/** Clamp user input to values that still render sensibly. */
export const STYLE_LIMITS = {
  fontSizePct: [2, 14],
  fontWeight: [300, 900],
  opacity: [0.2, 1],
  outlineWidth: [0, 6],
  bgAlpha: [0, 1],
  bgPadding: [0, 2],
  bgRadius: [0, 24],
  bottomPct: [0, 60],
  maxWidthPct: [30, 100],
  lineHeight: [1, 2],
  letterSpacing: [-2, 8],
} as const satisfies Partial<Record<keyof SubtitleStyle, readonly [number, number]>>;

export function clampStyle(style: SubtitleStyle): SubtitleStyle {
  const out = { ...style };
  for (const [key, [min, max]] of Object.entries(STYLE_LIMITS)) {
    const field = key as keyof typeof STYLE_LIMITS;
    const value = out[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[field] = Math.min(max, Math.max(min, value)) as never;
    } else {
      out[field] = DEFAULT_STYLE[field] as never;
    }
  }
  return out;
}

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return `rgba(0, 0, 0, ${alpha})`;

  let body = match[1];
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const value = parseInt(body, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The default appearance of the *second* track.
 *
 * A copy of the primary, smaller and slightly dimmer. That is not decoration: with two
 * lines of text on screen, equal weight makes neither one the one you are reading. The
 * secondary is normally the language you are learning from or checking against, so it
 * wants to be legible and subordinate.
 */
export function defaultSecondaryStyle(primary: SubtitleStyle): SubtitleStyle {
  return {
    ...primary,
    fontSizePct: Math.max(STYLE_LIMITS.fontSizePct[0], primary.fontSizePct * 0.8),
    opacity: 0.85,
  };
}

/**
 * Build the CSS for both text blocks, given how tall the overlay currently is.
 *
 * The two blocks live in one `.stack`, which is what carries the position. **Only the
 * primary's `bottomPct`, `maxWidthPct` and `textAlign` are read** — those describe where
 * the stack sits, and a secondary with its own idea of "bottom" would not be a second line,
 * it would be a second overlay. Everything else (font, size, colour, outline, background)
 * is per block.
 *
 * `column-reverse` puts the first DOM child at the bottom, so the primary keeps exactly the
 * position it would have had alone and does not jump when a secondary track is added.
 *
 * The outline uses `paint-order: stroke fill`, which strokes behind the glyph rather than
 * over it — without it a 2px stroke eats into thin letterforms and the text looks bolder
 * and muddier than intended.
 */
export function subtitleCss(
  styles: readonly [SubtitleStyle, SubtitleStyle],
  layout: DualLayout,
  overlayHeightPx: number,
): string {
  const primary = styles[0];
  const px = (pct: number) => (overlayHeightPx * pct) / 100;

  const align =
    primary.textAlign === 'left'
      ? 'flex-start'
      : primary.textAlign === 'right'
        ? 'flex-end'
        : 'center';

  return `
    .stack {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: ${px(primary.bottomPct).toFixed(2)}px;
      max-width: ${primary.maxWidthPct}%;
      display: flex;
      flex-direction: ${layout.order === 'secondary-above' ? 'column-reverse' : 'column'};
      gap: ${px(layout.gapPct).toFixed(2)}px;
      align-items: ${align};
    }
    /* A slot with no active cue must not hold the gap open, or the primary line shifts
       every time the secondary happens to be silent. */
    .cues:empty { display: none; }
    ${blockCss(0, styles[0], overlayHeightPx, align, primary.textAlign)}
    ${blockCss(1, styles[1], overlayHeightPx, align, primary.textAlign)}
  `;
}

/**
 * One slot's block: everything that is genuinely per-track.
 *
 * Alignment is passed in from the primary rather than read from `style`. Two blocks in one
 * stack that disagree about which edge they hang off do not read as a pair, and the panel
 * hides the control for the secondary to match.
 */
function blockCss(
  slot: 0 | 1,
  style: SubtitleStyle,
  overlayHeightPx: number,
  align: string,
  textAlign: string,
): string {
  const px = (pct: number) => (overlayHeightPx * pct) / 100;
  const fontSize = px(style.fontSizePct);

  const shadow = style.shadow
    ? `text-shadow: 0 ${(fontSize * 0.04).toFixed(2)}px ${(fontSize * 0.12).toFixed(2)}px rgba(0,0,0,0.85);`
    : 'text-shadow: none;';

  const stroke =
    style.outlineWidth > 0
      ? `-webkit-text-stroke: ${((fontSize * style.outlineWidth) / 100).toFixed(2)}px ${style.outlineColor};
         paint-order: stroke fill;`
      : '-webkit-text-stroke: 0;';

  return `
    .cues-${slot} {
      display: flex;
      flex-direction: column;
      gap: ${(fontSize * 0.18).toFixed(2)}px;
      align-items: ${align};
      text-align: ${textAlign};
      font-family: ${style.fontFamily};
      font-size: ${fontSize.toFixed(2)}px;
      font-weight: ${style.fontWeight};
      line-height: ${style.lineHeight};
      letter-spacing: ${((fontSize * style.letterSpacing) / 100).toFixed(3)}px;
      color: ${style.color};
      opacity: ${style.opacity};
      text-transform: ${style.uppercase ? 'uppercase' : 'none'};
      white-space: pre-wrap;
      overflow-wrap: break-word;
      ${stroke}
      ${shadow}
    }
    .cues-${slot} .cue {
      background: ${style.bgAlpha > 0 ? hexToRgba(style.bgColor, style.bgAlpha) : 'transparent'};
      padding: ${style.bgAlpha > 0 ? `${px(style.bgPadding).toFixed(2)}px ${px(style.bgPadding * 1.6).toFixed(2)}px` : '0'};
      border-radius: ${style.bgRadius}px;
      width: fit-content;
      max-width: 100%;
    }
  `;
}
