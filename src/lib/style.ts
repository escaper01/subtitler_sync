import type { SubtitleStyle } from '@/types';

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
 * Build the CSS for the text block, given how tall the overlay currently is.
 *
 * `.stack` carries the position (distance from the bottom, max width, alignment) and `.cues`
 * the text. They are separate elements so the position can be re-derived without touching
 * the text styling.
 *
 * The outline uses `paint-order: stroke fill`, which strokes behind the glyph rather than
 * over it — without it a 2px stroke eats into thin letterforms and the text looks bolder
 * and muddier than intended.
 */
export function subtitleCss(style: SubtitleStyle, overlayHeightPx: number): string {
  const px = (pct: number) => (overlayHeightPx * pct) / 100;
  const fontSize = px(style.fontSizePct);

  const align =
    style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center';

  const shadow = style.shadow
    ? `text-shadow: 0 ${(fontSize * 0.04).toFixed(2)}px ${(fontSize * 0.12).toFixed(2)}px rgba(0,0,0,0.85);`
    : 'text-shadow: none;';

  const stroke =
    style.outlineWidth > 0
      ? `-webkit-text-stroke: ${((fontSize * style.outlineWidth) / 100).toFixed(2)}px ${style.outlineColor};
         paint-order: stroke fill;`
      : '-webkit-text-stroke: 0;';

  return `
    .stack {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: ${px(style.bottomPct).toFixed(2)}px;
      max-width: ${style.maxWidthPct}%;
      display: flex;
      flex-direction: column;
      align-items: ${align};
    }
    .cues {
      display: flex;
      flex-direction: column;
      gap: ${(fontSize * 0.18).toFixed(2)}px;
      align-items: ${align};
      text-align: ${style.textAlign};
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
    .cues .cue {
      background: ${style.bgAlpha > 0 ? hexToRgba(style.bgColor, style.bgAlpha) : 'transparent'};
      padding: ${style.bgAlpha > 0 ? `${px(style.bgPadding).toFixed(2)}px ${px(style.bgPadding * 1.6).toFixed(2)}px` : '0'};
      border-radius: ${style.bgRadius}px;
      width: fit-content;
      max-width: 100%;
    }
  `;
}
