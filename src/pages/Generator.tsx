import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Download, Play, Shuffle, Sparkles, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HexLogo } from "@/components/HexLogo";
import { ControlsPanel } from "@/components/generator/ControlsPanel";
import { HistorySidebar } from "@/components/generator/HistorySidebar";
import { PianoRoll } from "@/components/generator/PianoRoll";
import {
  AudioEngine,
  DEFAULT_FX,
  DEFAULT_TRACK_MIX,
  type FxParams,
  type TrackMixState,
} from "@/lib/audio";
import {
  DEFAULT_SETTINGS,
  generateLoop,
  invertLoop,
  mutateLoop,
  randomSeed,
  type GeneratorSettings,
  type Loop,
  type NoteEvent,
  type TrackId,
} from "@/lib/music";
import { downloadMidi } from "@/lib/midi";
import {
  loadFx,
  loadHistory,
  loadSettings,
  makeEntry,
  persistFx,
  persistHistory,
  persistSettings,
  type HistoryEntry,
} from "@/lib/history";

const TRACK_IDS: TrackId[] = ["lead", "pad", "bass", "arp", "synth", "drums"];
const MAX_UNDO = 30;

/** Compare only the fields that change generated notes (BPM is live). */
function generationDiffers(a: GeneratorSettings, b: GeneratorSettings): boolean {
  return (
    a.root !== b.root ||
    a.scale !== b.scale ||
    a.resolution !== b.resolution ||
    a.bars !== b.bars ||
    a.swing !== b.swing ||
    a.mask.length !== b.mask.length ||
    a.mask.some((m, i) => m !== b.mask[i]) ||
    TRACK_IDS.some((t) => a.tracks[t] !== b.tracks[t])
  );
}

/** Backfills any track missing from an older, pre-drums saved loop/history entry. */
function normalizeNotes(notes: Partial<Record<TrackId, NoteEvent[]>>): Record<TrackId, NoteEvent[]> {
  return {
    lead: notes.lead ?? [],
    pad: notes.pad ?? [],
    bass: notes.bass ?? [],
    arp: notes.arp ?? [],
    synth: notes.synth ?? [],
    drums: notes.drums ?? [],
  };
}

export default function Generator() {
  const [settings, setSettings] = useState<GeneratorSettings>(
    () => loadSettings() ?? DEFAULT_SETTINGS,
  );
  const [fx, setFx] = useState<FxParams>(() => loadFx() ?? DEFAULT_FX);
  const [loop, setLoop] = useState<Loop>(() =>
    generateLoop(loadSettings() ?? DEFAULT_SETTINGS),
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [playing, setPlaying] = useState(false);
  const [trackMix, setTrackMix] = useState<Record<TrackId, TrackMixState>>(DEFAULT_TRACK_MIX);

  // Undo stack for hand-placed note edits in the piano roll (separate from the
  // seed history sidebar, which only tracks full re-generations).
  const [undoStack, setUndoStack] = useState<Loop[]>([]);
  const [notesEdited, setNotesEdited] = useState(false);

  const engine = useMemo(() => new AudioEngine(), []);
  const playheadRef = useRef<HTMLDivElement | null>(null);

  const dirty = generationDiffers(settings, loop.settings);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);
  useEffect(() => {
    persistFx(fx);
  }, [fx]);
  useEffect(() => {
    persistHistory(history);
  }, [history]);
  useEffect(() => {
    engine.updateFx(fx);
  }, [engine, fx]);
  useEffect(() => {
    engine.updateTrackMix(trackMix);
  }, [engine, trackMix]);
  useEffect(() => () => engine.stop(), [engine]);

  // Playhead animation.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      if (playheadRef.current) {
        playheadRef.current.style.left = `${(engine.getProgress() * 100).toFixed(2)}%`;
        playheadRef.current.style.opacity = "1";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (playheadRef.current) playheadRef.current.style.opacity = "0";
    };
  }, [engine, playing]);

  const stopPlayback = useCallback(() => {
    engine.stop();
    setPlaying(false);
  }, [engine]);

  const updateSettings = useCallback((patch: Partial<GeneratorSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const updateFx = useCallback((patch: Partial<FxParams>) => {
    setFx((f) => ({ ...f, ...patch }));
  }, []);

  /** True when leaving the current loop would silently drop hand-placed notes. */
  const confirmDiscardEdits = useCallback(() => {
    if (!notesEdited) return true;
    return window.confirm(
      "You've hand-edited notes in this loop that haven't been saved. This will discard them — continue?",
    );
  }, [notesEdited]);

  const summon = useCallback(() => {
    if (!confirmDiscardEdits()) return;
    stopPlayback();
    const next = generateLoop(settings, randomSeed());
    setLoop(next);
    setUndoStack([]);
    setNotesEdited(false);
    setHistory((h) => [makeEntry(next), ...h].slice(0, 40));
  }, [settings, stopPlayback, confirmDiscardEdits]);

  const mutate = useCallback(() => {
    stopPlayback();
    setLoop((l) => {
      setUndoStack((stack) => [...stack.slice(-(MAX_UNDO - 1)), l]);
      setNotesEdited(true);
      return mutateLoop(l);
    });
  }, [stopPlayback]);

  const invert = useCallback(() => {
    stopPlayback();
    setLoop((l) => {
      setUndoStack((stack) => [...stack.slice(-(MAX_UNDO - 1)), l]);
      setNotesEdited(true);
      return invertLoop(l);
    });
  }, [stopPlayback]);

  /** Piano-roll edits (add/remove/retune a note) push the prior state onto the undo stack. */
  const editLoop = useCallback(
    (next: Loop) => {
      setUndoStack((stack) => [...stack.slice(-(MAX_UNDO - 1)), loop]);
      setNotesEdited(true);
      setLoop(next);
    },
    [loop],
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setLoop(prev);
      const rest = stack.slice(0, -1);
      setNotesEdited(rest.length > 0);
      return rest;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  const toggleTrackMute = useCallback((track: TrackId) => {
    setTrackMix((mix) => ({
      ...mix,
      [track]: { ...mix[track], mute: !mix[track].mute },
    }));
  }, []);

  const toggleTrackSolo = useCallback((track: TrackId) => {
    setTrackMix((mix) => ({
      ...mix,
      [track]: { ...mix[track], solo: !mix[track].solo },
    }));
  }, []);

  const togglePlay = useCallback(async () => {
    if (engine.isPlaying) {
      stopPlayback();
      return;
    }
    await engine.start(loop, settings.bpm, fx);
    setPlaying(true);
  }, [engine, loop, settings.bpm, fx, stopPlayback]);

  const exportMidi = useCallback(() => {
    const exportLoop: Loop = {
      ...loop,
      settings: { ...loop.settings, bpm: settings.bpm },
    };
    downloadMidi(exportLoop);
  }, [loop, settings.bpm]);

  const recall = useCallback(
    (entry: HistoryEntry) => {
      if (!confirmDiscardEdits()) return;
      stopPlayback();
      const normalized: GeneratorSettings = {
        ...DEFAULT_SETTINGS,
        ...entry.settings,
        tracks: { ...DEFAULT_SETTINGS.tracks, ...entry.settings.tracks },
      };
      setLoop({
        seed: entry.seed,
        notes: normalizeNotes(entry.notes),
        settings: normalized,
        createdAt: entry.createdAt,
      });
      setSettings(normalized);
      setUndoStack([]);
      setNotesEdited(false);
    },
    [stopPlayback, confirmDiscardEdits],
  );

  const toggleFavorite = useCallback((id: string) => {
    setHistory((h) =>
      h.map((e) => (e.id === id ? { ...e, favorited: !e.favorited } : e)),
    );
  }, []);

  const renameEntry = useCallback((id: string, name: string) => {
    setHistory((h) => h.map((e) => (e.id === id ? { ...e, name } : e)));
  }, []);

  const copySeed = useCallback(async (seed: string) => {
    try {
      await navigator.clipboard.writeText(seed);
    } catch {
      // Clipboard may be unavailable on non-secure origins.
    }
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setHistory((h) => h.filter((e) => e.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="hexed-scanlines" aria-hidden="true" />

      <header className="sticky top-0 z-20 border-b border-border bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <HexLogo />

          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="mr-1 animate-pulse rounded-sm border border-red-500/60 bg-red-500/10 px-2 py-1 text-[9px] font-bold tracking-widest text-red-400">
                PRESS SUMMON
              </span>
            )}
            {notesEdited && (
              <span className="mr-1 rounded-sm border border-yellow-400/60 bg-yellow-400/10 px-2 py-1 text-[9px] font-bold tracking-widest text-yellow-400">
                UNSAVED EDITS
              </span>
            )}
            <Button
              type="button"
              onClick={summon}
              className="bg-red-600 font-bold tracking-widest text-white hover:bg-red-500"
            >
              <Sparkles className="size-4" />
              SUMMON
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={togglePlay}
              className="font-bold tracking-widest"
            >
              {playing ? (
                <Square className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
              {playing ? "STOP" : "PREVIEW"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={mutate}
              className="font-bold tracking-widest"
            >
              <Shuffle className="size-4" />
              MUTATE 10%
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo last note edit (Ctrl/Cmd+Z)"
              className="font-bold tracking-widest"
            >
              <Undo2 className="size-4" />
              UNDO
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={invert}
              className="font-bold tracking-widest"
            >
              <ArrowUpDown className="size-4" />
              INVERT
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={exportMidi}
              className="font-bold tracking-widest"
            >
              <Download className="size-4" />
              MIDI STEMS
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 lg:h-[calc(100dvh-64px)] lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        <ControlsPanel
          settings={settings}
          fx={fx}
          onSettings={updateSettings}
          onFx={updateFx}
          getWaveformData={() => engine.getWaveformData()}
        />
        <div className="min-w-0 p-3 lg:h-full lg:min-h-0">
          <PianoRoll
            loop={loop}
            playheadRef={playheadRef}
            onLoopChange={editLoop}
            trackMix={trackMix}
            onToggleMute={toggleTrackMute}
            onToggleSolo={toggleTrackSolo}
          />
        </div>
        <HistorySidebar
          entries={history}
          currentSeed={loop.seed}
          onRecall={recall}
          onToggleFavorite={toggleFavorite}
          onRename={renameEntry}
          onDelete={deleteEntry}
          onCopySeed={copySeed}
        />
      </main>
    </div>
  );
}
