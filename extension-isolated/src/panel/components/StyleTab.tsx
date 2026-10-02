import { selectStyle, usePanel } from '@/panel/store';
import { STYLE_LIMITS, STYLE_PRESETS } from '@/lib/style';
import { Button, ColorField, Select, Slider, Switch } from '@/panel/components/ui';

const FONTS = [
  { value: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', label: 'System sans' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Courier New", monospace', label: 'Courier' },
];

export function StyleTab() {
  const style = usePanel(selectStyle);
  const setStyle = usePanel((s) => s.setStyle);
  const replaceStyle = usePanel((s) => s.replaceStyle);

  const limit = (key: keyof typeof STYLE_LIMITS) => STYLE_LIMITS[key];

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[11px] font-medium text-white/70">Presets</div>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              size="sm"
              title={preset.description}
              onClick={() => replaceStyle(preset.style)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      <Preview />

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 @lg:grid-cols-3">
        <div className="col-span-2 @lg:col-span-3">
          <Select
            label="Font"
            value={style.fontFamily}
            options={FONTS}
            onChange={(value) => setStyle({ fontFamily: value })}
          />
        </div>

        <Slider
          label="Size"
          value={style.fontSizePct}
          min={limit('fontSizePct')[0]}
          max={limit('fontSizePct')[1]}
          step={0.1}
          unit="%"
          onChange={(value) => setStyle({ fontSizePct: value })}
        />
        <Slider
          label="Weight"
          value={style.fontWeight}
          min={limit('fontWeight')[0]}
          max={limit('fontWeight')[1]}
          step={100}
          onChange={(value) => setStyle({ fontWeight: value })}
        />

        <ColorField label="Colour" value={style.color} onChange={(value) => setStyle({ color: value })} />
        <ColorField
          label="Outline colour"
          value={style.outlineColor}
          onChange={(value) => setStyle({ outlineColor: value })}
        />

        <Slider
          label="Outline"
          value={style.outlineWidth}
          min={limit('outlineWidth')[0]}
          max={limit('outlineWidth')[1]}
          step={0.5}
          onChange={(value) => setStyle({ outlineWidth: value })}
        />
        <Slider
          label="Opacity"
          value={style.opacity}
          min={limit('opacity')[0]}
          max={limit('opacity')[1]}
          step={0.05}
          onChange={(value) => setStyle({ opacity: value })}
        />

        <ColorField
          label="Box colour"
          value={style.bgColor}
          onChange={(value) => setStyle({ bgColor: value })}
        />
        <Slider
          label="Box opacity"
          value={style.bgAlpha}
          min={limit('bgAlpha')[0]}
          max={limit('bgAlpha')[1]}
          step={0.05}
          onChange={(value) => setStyle({ bgAlpha: value })}
        />

        <Slider
          label="Distance from bottom"
          value={style.bottomPct}
          min={limit('bottomPct')[0]}
          max={limit('bottomPct')[1]}
          step={0.5}
          unit="%"
          onChange={(value) => setStyle({ bottomPct: value })}
        />
        <Slider
          label="Max width"
          value={style.maxWidthPct}
          min={limit('maxWidthPct')[0]}
          max={limit('maxWidthPct')[1]}
          step={1}
          unit="%"
          onChange={(value) => setStyle({ maxWidthPct: value })}
        />

        <Slider
          label="Line height"
          value={style.lineHeight}
          min={limit('lineHeight')[0]}
          max={limit('lineHeight')[1]}
          step={0.05}
          onChange={(value) => setStyle({ lineHeight: value })}
        />
        <Slider
          label="Letter spacing"
          value={style.letterSpacing}
          min={limit('letterSpacing')[0]}
          max={limit('letterSpacing')[1]}
          step={0.5}
          onChange={(value) => setStyle({ letterSpacing: value })}
        />

        <Select
          label="Alignment"
          value={style.textAlign}
          options={[
            { value: 'center', label: 'Centre' },
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(value) => setStyle({ textAlign: value })}
        />
        <Select
          label="Position against"
          value={style.anchorTo}
          options={[
            { value: 'picture', label: 'Picture' },
            { value: 'player', label: 'Player box' },
          ]}
          onChange={(value) => setStyle({ anchorTo: value })}
        />

        <div className="col-span-2 space-y-0.5 border-t @lg:col-span-3 border-white/10 pt-2">
          <Switch
            label="Drop shadow"
            checked={style.shadow}
            onChange={(value) => setStyle({ shadow: value })}
          />
          <Switch
            label="Uppercase"
            checked={style.uppercase}
            onChange={(value) => setStyle({ uppercase: value })}
          />
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-white/35">
        Size and position are percentages of the video's height, so they hold their proportions
        in fullscreen. "Position against picture" keeps text inside the image rather than
        drifting into the black bars.
      </p>
    </div>
  );
}

/**
 * A live sample rendered with the same declarations as the overlay.
 *
 * It deliberately re-derives the look from the style object rather than reusing
 * `subtitleCss`: that function sizes everything against the video's height, which has no
 * meaning inside a small panel. The preview is a fair approximation, not a mirror.
 */
function Preview() {
  const style = usePanel(selectStyle);
  const fontSize = Math.max(9, Math.min(20, style.fontSizePct * 2.4));

  return (
    <div className="relative h-16 overflow-hidden rounded border border-white/10 bg-[linear-gradient(135deg,#1f2937,#0f172a_60%,#334155)]">
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
        style={{
          bottom: `${style.bottomPct * 0.5}%`,
          fontFamily: style.fontFamily,
          fontSize: `${fontSize}px`,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: `${(fontSize * style.letterSpacing) / 100}px`,
          color: style.color,
          opacity: style.opacity,
          textTransform: style.uppercase ? 'uppercase' : 'none',
          textAlign: style.textAlign,
          WebkitTextStroke:
            style.outlineWidth > 0
              ? `${(fontSize * style.outlineWidth) / 100}px ${style.outlineColor}`
              : undefined,
          paintOrder: 'stroke fill',
          textShadow: style.shadow ? `0 ${fontSize * 0.04}px ${fontSize * 0.12}px rgba(0,0,0,0.85)` : 'none',
          background:
            style.bgAlpha > 0
              ? `color-mix(in srgb, ${style.bgColor} ${style.bgAlpha * 100}%, transparent)`
              : 'transparent',
          padding: style.bgAlpha > 0 ? `${fontSize * 0.1}px ${fontSize * 0.3}px` : 0,
          borderRadius: `${style.bgRadius}px`,
        }}
      >
        The quick brown fox
      </div>
    </div>
  );
}
