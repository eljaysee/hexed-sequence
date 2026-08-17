import { useMemo, useRef, type RefObject } from "react";
import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DRUM_NOTES,
  PPQ,
  RESOLUTION_STEPS,
  type Loop,
  type NoteEvent,
  type TrackId,
} from "@/lib/music";
import type { TrackMixState } from "@/lib/audio";
import { TRACK_META } from "./ControlsPanel";

interface PianoRollProps {
  loop: Loop;
  playheadRef: RefObject<HTMLDivElement | null>;
  onLoopChange: (loop: Loop) => void;
  trackMix: Record<TrackId, TrackMixState>;
  onToggleMute: (track: TrackId) => void;
  onToggleSolo: (track: TrackId) => void;
}

const ROW_H = 34;
const PITCH_PX = 3;

/** Fallback velocity for a track's first hand-placed note, before any notes exist to average. */
const DEFAULT_VELOCITY: Record<TrackId, number> = {
  lead: 106,
  pad: 70,
  bass: 95,
  arp: 85,
  synth: 62,
  drums: 100,
};

function stepTicks(loop: Loop) {
  return PPQ / RESOLUTION_STEPS[loop.settings.resolution];
}

const DRUM_NAMES: Record<number, string> = {
  [DRUM_NOTES.kick]: "Kick",
  [DRUM_NOTES.snare]: "Snare",
  [DRUM_NOTES.closedHat]: "Closed Hat",
  [DRUM_NOTES.openHat]: "Open Hat",
  [DRUM_NOTES.crash]: "Crash",
};
const DRUM_PITCHES = Object.values(DRUM_NOTES);

/** Snap a raw pointer-derived pitch to the nearest real percussion voice. */
function snapDrumMidi(midi: number): number {
  let best = DRUM_PITCHES[0];
  let bestDist = Infinity;
  for (const p of DRUM_PITCHES) {
    const d = Math.abs(p - midi);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function trackRange(notes: NoteEvent[]) {
  if (!notes.length) return { min: 36, max: 84 };
  const pitches = notes.map((n) => n.midi);
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  return { min: min - 2, max: Math.max(min + 8, max + 2) };
}

export function PianoRoll({
  loop,
  playheadRef,
  onLoopChange,
  trackMix,
  onToggleMute,
  onToggleSolo,
}: PianoRollProps) {
  const ticks = stepTicks(loop);
  const totalSteps =
    loop.settings.bars * 4 * RESOLUTION_STEPS[loop.settings.resolution];
  const dragging = useRef<{
    track: TrackId;
    index: number;
    startY: number;
    midi: number;
  } | null>(null);

  const rows = useMemo(
    () =>
      TRACK_META.map((meta) => ({
        ...meta,
        notes: loop.notes[meta.id],
        range: trackRange(loop.notes[meta.id]),
      })),
    [loop],
  );
  const noteCount = rows.reduce((sum, row) => sum + row.notes.length, 0);

  const updateNote = (track: TrackId, index: number, midi: number) => {
    const clamped = Math.max(21, Math.min(108, midi));
    const finalMidi = track === "drums" ? snapDrumMidi(clamped) : clamped;
    const notes = loop.notes[track].map((note, i) =>
      i === index ? { ...note, midi: finalMidi } : note,
    );
    onLoopChange({
      ...loop,
      notes: { ...loop.notes, [track]: notes },
    });
  };

  const toggleNote = (track: TrackId, index: number) => {
    onLoopChange({
      ...loop,
      notes: {
        ...loop.notes,
        [track]: loop.notes[track].filter((_, i) => i !== index),
      },
    });
  };

  const addNote = (track: TrackId, step: number, rawMidi: number) => {
    const trackNotes = loop.notes[track];
    const stepStart = step * ticks;
    const midi = track === "drums" ? snapDrumMidi(rawMidi) : rawMidi;

    // Clicking a cell that already holds a note (same step + pitch) removes it,
    // instead of stacking a duplicate note underneath.
    const existingIndex = trackNotes.findIndex(
      (n) => n.start === stepStart && n.midi === midi,
    );
    if (existingIndex >= 0) {
      toggleNote(track, existingIndex);
      return;
    }

    // New notes inherit the track's current average velocity so hand-placed
    // notes sit at a similar dynamic level to the generated ones around them.
    const velocity = trackNotes.length
      ? Math.round(trackNotes.reduce((sum, n) => sum + n.velocity, 0) / trackNotes.length)
      : DEFAULT_VELOCITY[track];

    const notes = [
      ...trackNotes,
      { start: stepStart, duration: ticks, midi, velocity },
    ].sort((a, b) => a.start - b.start);
    onLoopChange({
      ...loop,
      notes: { ...loop.notes, [track]: notes },
    });
  };

  const copySeed = async () => {
    try {
      await navigator.clipboard.writeText(loop.seed);
    } catch {
      // Clipboard may be unavailable on non-secure origins.
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-md border border-border bg-card/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
        <h2 className="text-[10px] font-bold tracking-[0.25em] text-muted-foreground">STEP GRID / PIANO ROLL</h2>
        <div className="flex items-center gap-2 text-[10px] tracking-wider text-muted-foreground">
          <span>SEED <span className="text-red-400">{loop.seed}</span></span>
          <Button type="button" size="icon" variant="ghost" className="size-6" title="Copy live seed" onClick={copySeed}>
            <Clipboard className="size-3" />
          </Button>
          <span className="hidden sm:inline">{noteCount} NOTES</span>
        </div>
      </div>

      <div className="flex border-b border-border/50 px-2 py-1">
        <div className="w-16 shrink-0" />
        <div className="relative h-3 flex-1 text-[9px] text-muted-foreground">
          {Array.from({ length: loop.settings.bars }).map((_, b) => (
            <span key={b} className="absolute -translate-x-1/2" style={{ left: `${(b / loop.settings.bars) * 100}%` }}>{b + 1}</span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="flex">
          <div className="w-16 shrink-0 space-y-1">
            {rows.map((row) => {
              const mix = trackMix[row.id];
              return (
                <div key={row.id} className="flex items-center gap-1" style={{ height: ROW_H }}>
                  <span
                    className="truncate text-[10px] font-bold tracking-wider"
                    style={{ color: row.color, opacity: mix.mute ? 0.35 : 1 }}
                    title={row.name}
                  >
                    {row.name.toUpperCase()}
                  </span>
                  <div className="ml-auto flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      title={mix.mute ? "Unmute" : "Mute"}
                      onClick={() => onToggleMute(row.id)}
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[2px] border text-[8px] font-bold",
                        mix.mute
                          ? "border-red-500 bg-red-500 text-black"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      title={mix.solo ? "Unsolo" : "Solo"}
                      onClick={() => onToggleSolo(row.id)}
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[2px] border text-[8px] font-bold",
                        mix.solo
                          ? "border-yellow-400 bg-yellow-400 text-black"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      S
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="relative flex-1">
            <div className="space-y-1">
              {rows.map((row) => {
                const range = row.range;
                return (
                  <div
                    key={row.id}
                    className="relative rounded-sm"
                    style={{ height: ROW_H }}
                    onPointerDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const step = Math.max(0, Math.min(totalSteps - 1, Math.floor(((e.clientX - rect.left) / rect.width) * totalSteps)));
                      const midi = Math.round(range.max - ((e.clientY - rect.top) / rect.height) * (range.max - range.min));
                      addNote(row.id, step, midi);
                    }}
                  >
                    <div className="absolute inset-0 grid gap-px" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
                      {Array.from({ length: totalSteps }).map((_, i) => (
                        <div key={i} className={cn("rounded-[1px]", i % (RESOLUTION_STEPS[loop.settings.resolution] * 4) === 0 ? "bg-white/[0.07]" : i % RESOLUTION_STEPS[loop.settings.resolution] === 0 ? "bg-white/[0.035]" : "bg-white/[0.014]")} />
                      ))}
                    </div>
                    {row.notes.map((note, index) => {
                      const left = (note.start / (loop.settings.bars * PPQ * 4)) * 100;
                      const width = Math.max((note.duration / (loop.settings.bars * PPQ * 4)) * 100, 0.18);
                      const pitchNorm = (note.midi - range.min) / Math.max(1, range.max - range.min);
                      const top = (1 - pitchNorm) * (ROW_H - 12);
                      return (
                        <button
                          key={`${row.id}-${index}-${note.start}-${note.midi}`}
                          type="button"
                          title={
                            row.id === "drums"
                              ? `${DRUM_NAMES[note.midi] ?? note.midi} · drag to change voice · click to remove`
                              : `${note.midi} · drag vertically to retune · click to remove`
                          }
                          className="absolute z-10 h-3 min-w-[2px] rounded-[2px] border border-white/10 shadow-[0_0_5px_rgba(255,45,63,0.25)] transition-[top,height,opacity] hover:brightness-125"
                          style={{ left: `${left}%`, width: `${width}%`, top, backgroundColor: row.color, opacity: 0.35 + note.velocity / 180 }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragging.current = { track: row.id, index, startY: e.clientY, midi: note.midi };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            const drag = dragging.current;
                            if (!drag || drag.track !== row.id || drag.index !== index) return;
                            const delta = Math.round((drag.startY - e.clientY) / PITCH_PX);
                            if (delta !== 0) updateNote(row.id, index, drag.midi + delta);
                          }}
                          onPointerUp={(e) => {
                            const drag = dragging.current;
                            dragging.current = null;
                            if (drag && Math.abs(e.clientY - drag.startY) < 5) toggleNote(row.id, index);
                          }}
                          onPointerCancel={() => { dragging.current = null; }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 z-20 w-px bg-red-500 opacity-0 shadow-[0_0_8px_rgba(255,45,63,0.9)]" style={{ left: 0 }} />
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-2 text-[9px] tracking-wider text-muted-foreground">
        CLICK EMPTY GRID = ADD NOTE · CLICK NOTE = REMOVE · DRAG NOTE VERTICALLY = PITCH
      </div>
    </section>
  );
}
