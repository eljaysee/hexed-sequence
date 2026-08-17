import { useEffect, useRef, type ReactNode } from "react";
import {
  INTERVAL_NAMES,
  NOTE_NAMES,
  SCALES,
  getScale,
  type GeneratorSettings,
  type ResolutionId,
  type ScaleId,
  type TrackId,
} from "@/lib/music";
import type { FxParams } from "@/lib/audio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const TRACK_META: { id: TrackId; name: string; color: string }[] = [
  { id: "lead", name: "Lead", color: "#ff2d3f" },
  { id: "pad", name: "Pad", color: "#9b5cff" },
  { id: "bass", name: "Bass", color: "#ff7a1a" },
  { id: "arp", name: "Arp", color: "#2dd4bf" },
  { id: "synth", name: "Dungeon Synth", color: "#c084fc" },
  { id: "drums", name: "Drums", color: "#e8d34c" },
];

const RESOLUTIONS: { id: ResolutionId; label: string }[] = [
  { id: "8", label: "1/8" },
  { id: "16", label: "1/16" },
  { id: "32", label: "1/32" },
];

const BARS = [1, 2, 4, 8];

interface ControlsPanelProps {
  settings: GeneratorSettings;
  fx: FxParams;
  onSettings: (patch: Partial<GeneratorSettings>) => void;
  onFx: (patch: Partial<FxParams>) => void;
  getWaveformData: () => Uint8Array | null;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/70 px-4 py-4">
      <h3 className="mb-3 text-[10px] font-bold tracking-[0.25em] text-red-500/90">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold text-foreground">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

export function ControlsPanel({
  settings,
  fx,
  onSettings,
  onFx,
  getWaveformData,
}: ControlsPanelProps) {
  const scale = getScale(settings.scale);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = waveformRef.current;
      const data = getWaveformData();
      if (canvas && data) {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(240, canvas.clientWidth);
        const height = canvas.clientHeight || 72;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);
          ctx.strokeStyle = "rgba(255,45,63,0.9)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          const mid = height / 2;
          data.forEach((value, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = mid + ((value - 128) / 128) * (height * 0.38);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getWaveformData]);


  const toggleMask = (idx: number) => {
    const has = settings.mask.includes(idx);
    onSettings({
      mask: has
        ? settings.mask.filter((i) => i !== idx)
        : [...settings.mask, idx],
    });
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card/40">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="SCALE">
          <Select
            value={settings.scale}
            onValueChange={(v) => onSettings({ scale: v as ScaleId })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-3">
            <p className="mb-1.5 text-[11px] text-muted-foreground">ROOT NOTE</p>
            <div className="flex flex-wrap gap-1">
              {NOTE_NAMES.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSettings({ root: i })}
                  className={cn(
                    "h-7 w-7 rounded-sm border text-[11px] font-bold transition-colors",
                    settings.root === i
                      ? "border-red-500 bg-red-500 text-black"
                      : "border-border bg-black/40 text-foreground hover:border-red-500/60",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              INTERVAL MASK ·{" "}
              <span className="text-red-400/80">force dissonance</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {scale.intervals.map((iv, idx) => {
                const active = settings.mask.includes(idx);
                const noteName = NOTE_NAMES[(settings.root + iv) % 12];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleMask(idx)}
                    title={`${INTERVAL_NAMES[iv]} (${noteName})`}
                    className={cn(
                      "flex h-7 items-center gap-0.5 rounded-sm border px-1.5 text-[11px] font-bold transition-colors",
                      active
                        ? "border-red-500 bg-red-500/15 text-red-400"
                        : "border-border bg-black/40 text-muted-foreground hover:border-red-500/60 hover:text-foreground",
                    )}
                  >
                    {INTERVAL_NAMES[iv]}
                    <span className="text-[9px] opacity-50">{noteName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="TEMPO & STRUCTURE">
          <SliderRow
            label="BPM"
            value={settings.bpm}
            min={110}
            max={170}
            step={1}
            onChange={(v) => onSettings({ bpm: v })}
          />

          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">BARS</span>
            <div className="flex gap-1">
              {BARS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onSettings({ bars: b })}
                  className={cn(
                    "h-7 w-9 rounded-sm border text-[11px] font-bold transition-colors",
                    settings.bars === b
                      ? "border-red-500 bg-red-500 text-black"
                      : "border-border bg-black/40 text-foreground hover:border-red-500/60",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">RESOLUTION</span>
            <div className="flex gap-1">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSettings({ resolution: r.id })}
                  className={cn(
                    "h-7 rounded-sm border px-2 text-[11px] font-bold transition-colors",
                    settings.resolution === r.id
                      ? "border-red-500 bg-red-500 text-black"
                      : "border-border bg-black/40 text-foreground hover:border-red-500/60",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <SliderRow
            label="SWING"
            value={settings.swing}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => onSettings({ swing: v })}
          />
        </Section>

        <Section title="STEMS">
          <div className="grid grid-cols-2 gap-1.5">
            {TRACK_META.map((t) => {
              const active = settings.tracks[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onSettings({
                      tracks: { ...settings.tracks, [t.id]: !active },
                    })
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-2 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    active
                      ? "border-red-500/70 bg-red-500/10 text-foreground"
                      : "border-border bg-black/40 text-muted-foreground opacity-50 hover:opacity-90",
                  )}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.name}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="SIGNAL CHAIN">
          <div className="mb-4 flex items-center justify-between rounded-sm border border-border bg-black/30 px-3 py-2">
            <div>
              <p className="text-[10px] font-bold tracking-widest">FX BYPASS</p>
              <p className="text-[9px] text-muted-foreground">Clean preview path</p>
            </div>
            <Switch
              checked={fx.bypass}
              onCheckedChange={(checked) => onFx({ bypass: checked })}
            />
          </div>
          <SliderRow
            label="DRIVE"
            value={fx.drive}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onFx({ drive: v })}
          />
          <SliderRow
            label="BIT DEPTH"
            value={fx.bits}
            min={2}
            max={16}
            step={1}
            format={(v) => `${v} bit`}
            onChange={(v) => onFx({ bits: v })}
          />
          <SliderRow
            label="SAMPLE CRUSH"
            value={fx.downsample}
            min={1}
            max={16}
            step={1}
            format={(v) => `1/${v}`}
            onChange={(v) => onFx({ downsample: v })}
          />
          <SliderRow
            label="LP FILTER"
            value={fx.cutoff}
            min={60}
            max={8000}
            step={10}
            format={(v) => `${v} Hz`}
            onChange={(v) => onFx({ cutoff: v })}
          />
          <SliderRow
            label="VOLUME"
            value={fx.volume}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onFx({ volume: v })}
          />
          <div className="mt-3 overflow-hidden rounded-sm border border-border bg-black/50">
            <div className="border-b border-border/60 px-2 py-1 text-[8px] font-bold tracking-[0.2em] text-muted-foreground">
              OSCILLOSCOPE
            </div>
            <canvas
              ref={waveformRef}
              className="block h-[72px] w-full"
              aria-label="Real-time audio waveform"
            />
          </div>
        </Section>
      </div>
    </aside>
  );
}
