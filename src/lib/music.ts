// Music theory, seeded pattern generation, and mutation logic for Hexed Sequence.
// Notes are represented in MIDI ticks at PPQ (pulses per quarter note) so a loop
// can be played back and exported to a .mid file with identical timing.

export type TrackId = "lead" | "pad" | "bass" | "arp" | "synth" | "drums";

export interface NoteEvent {
  /** Start time in ticks. */
  start: number;
  /** Duration in ticks. */
  duration: number;
  /** MIDI note number, 0..127. */
  midi: number;
  /** Velocity, 1..127. */
  velocity: number;
}

export type ScaleId =
  | "harmonic-minor"
  | "phrygian-dominant"
  | "locrian"
  | "double-harmonic-minor"
  | "hungarian-minor";

export type ResolutionId = "8" | "16" | "32";

export interface GeneratorSettings {
  bpm: number;
  /** Root note, 0..11 (C = 0). */
  root: number;
  scale: ScaleId;
  resolution: ResolutionId;
  bars: number;
  /** Scale degree indices that should be emphasized by the generators. */
  mask: number[];
  tracks: Record<TrackId, boolean>;
  /** Swing amount, 0..100. Delays every other subdivision for a trap-style shuffle. */
  swing: number;
}

export interface Loop {
  seed: string;
  notes: Record<TrackId, NoteEvent[]>;
  settings: GeneratorSettings;
  createdAt: number;
}

export const PPQ = 480;

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export interface ScaleDef {
  id: ScaleId;
  name: string;
  intervals: number[];
}

export const SCALES: ScaleDef[] = [
  { id: "harmonic-minor", name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: "phrygian-dominant", name: "Phrygian Dominant", intervals: [0, 1, 4, 5, 7, 8, 10] },
  { id: "locrian", name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: "double-harmonic-minor", name: "Double Harmonic Minor", intervals: [0, 1, 4, 5, 7, 8, 11] },
  { id: "hungarian-minor", name: "Hungarian Minor", intervals: [0, 2, 3, 6, 7, 8, 11] },
];

export function getScale(id: ScaleId): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

export const INTERVAL_NAMES: Record<number, string> = {
  0: "R",
  1: "b2",
  2: "2",
  3: "b3",
  4: "3",
  5: "4",
  6: "b5",
  7: "5",
  8: "b6",
  9: "6",
  10: "b7",
  11: "7",
};

export const RESOLUTION_STEPS: Record<ResolutionId, number> = {
  "8": 2,
  "16": 4,
  "32": 8,
};

/** General MIDI percussion note numbers used by the drum generator. */
export const DRUM_NOTES = {
  kick: 36,
  snare: 38,
  closedHat: 42,
  openHat: 46,
  crash: 49,
} as const;

export const DEFAULT_SETTINGS: GeneratorSettings = {
  bpm: 140,
  root: 0,
  scale: "phrygian-dominant",
  resolution: "16",
  bars: 4,
  mask: [],
  tracks: { lead: true, pad: true, bass: true, arp: true, synth: true, drums: true },
  swing: 0,
};

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic 32-bit PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): string {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface GenCtx {
  rand: () => number;
  settings: GeneratorSettings;
  intervals: number[];
  rootMidi: number;
  stepsPerBeat: number;
  stepTicks: number;
  totalSteps: number;
  weights: number[];
  /** Extra tick offset applied to odd-numbered steps for a shuffled feel. */
  swingTicks: number;
}

/** Swing offset for a given step: 0 on the beat, swingTicks on the "and". */
function swingOffset(ctx: GenCtx, step: number): number {
  return step % 2 === 1 ? ctx.swingTicks : 0;
}

function makeWeights(intervals: number[], mask: number[]): number[] {
  if (mask.length === 0) return intervals.map(() => 1);
  return intervals.map((_, i) => (mask.includes(i) ? 1 : 0.28));
}

function makeCtx(settings: GeneratorSettings, rand: () => number): GenCtx {
  const intervals = getScale(settings.scale).intervals;
  const stepsPerBeat = RESOLUTION_STEPS[settings.resolution];
  const stepTicks = PPQ / stepsPerBeat;
  const totalSteps = settings.bars * 4 * stepsPerBeat;
  const rootMidi = 48 + settings.root;
  const weights = makeWeights(intervals, settings.mask);
  const swingTicks = stepTicks * 0.33 * clamp(settings.swing, 0, 100) / 100;
  return {
    rand,
    settings,
    intervals,
    rootMidi,
    stepsPerBeat,
    stepTicks,
    totalSteps,
    weights,
    swingTicks,
  };
}

function pickWeighted(rand: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** Map a scale degree index (can be negative/large) to a MIDI note. */
function degreeMidi(ctx: GenCtx, degree: number, octave: number): number {
  const len = ctx.intervals.length;
  const idx = mod(degree, len);
  const octUp = Math.floor(degree / len);
  return ctx.rootMidi + (octave + octUp) * 12 + ctx.intervals[idx];
}

function clampMidi(midi: number): number {
  return clamp(midi, 21, 108);
}

function jitter(rand: () => number, amount: number): number {
  return (rand() * 2 - 1) * amount;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function genLead(ctx: GenCtx): NoteEvent[] {
  const out: NoteEvent[] = [];
  let degree = ctx.intervals.length + 7; // mid register
  let octave = 1;
  for (let step = 0; step < ctx.totalSteps; step++) {
    if (ctx.rand() < 0.10) continue; // occasional breath

    // Occasional octave jumps for the black-metal tremolo character.
    const jumpRoll = ctx.rand();
    if (jumpRoll < 0.08) octave = Math.min(2, octave + 1);
    else if (jumpRoll < 0.16) octave = Math.max(-1, octave - 1);

    // Random walk keeps the run melodic rather than pure noise.
    const walk = [-2, -1, -1, 1, 1, 2][Math.floor(ctx.rand() * 6)];
    degree = Math.max(0, Math.min(ctx.intervals.length * 2 - 1, degree + walk));

    const midi = clampMidi(degreeMidi(ctx, degree, octave));
    // Humanized picking: alternate accent on every other step.
    const base = step % 2 === 0 ? 116 : 92;
    const velocity = Math.round(clamp(base + jitter(ctx.rand, 10), 30, 127));
    const timingJitter = Math.round(jitter(ctx.rand, ctx.stepTicks * 0.06));

    out.push({
      start: step * ctx.stepTicks + swingOffset(ctx, step) + timingJitter,
      duration: Math.round(ctx.stepTicks * (ctx.rand() < 0.08 ? 1.7 : 0.92)),
      midi,
      velocity,
    });
  }
  return out;
}

function genPad(ctx: GenCtx): NoteEvent[] {
  const out: NoteEvent[] = [];
  const barTicks = PPQ * 4;

  // Key-level color tones: the scale degrees sitting at b2 and b5.
  const b2Idx = ctx.intervals.indexOf(1);
  const b5Idx = ctx.intervals.indexOf(6);

  for (let bar = 0; bar < ctx.settings.bars; bar++) {
    const rootDeg = pickWeighted(ctx.rand, ctx.weights) - 7;
    const chord = [rootDeg, rootDeg + 2, rootDeg + 4].map((d) =>
      clampMidi(degreeMidi(ctx, d, 0)),
    );

    const color: number[] = [];
    if (b2Idx >= 0 && ctx.rand() < 0.6) color.push(clampMidi(degreeMidi(ctx, b2Idx + 7, 0)));
    if (b5Idx >= 0 && ctx.rand() < 0.5) color.push(clampMidi(degreeMidi(ctx, b5Idx + 7, 0)));

    const dur = Math.round(barTicks * (ctx.rand() < 0.22 ? 0.78 : 0.92));
    for (const midi of [...chord, ...color]) {
      out.push({
        start: bar * barTicks,
        duration: Math.round(dur),
        midi,
        velocity: Math.round(48 + ctx.rand() * 12),
      });
    }
  }
  return out;
}

function genBass(ctx: GenCtx): NoteEvent[] {
  const out: NoteEvent[] = [];
  const rootMidi = clampMidi(degreeMidi(ctx, 0, -2)); // sub register
  const octMidi = rootMidi + 12;
  const pickupMidi = rootMidi + 1; // semitone pickup

  for (let step = 0; step < ctx.totalSteps; step++) {
    const sub = step % ctx.stepsPerBeat;
    const beatInBar = Math.floor(step / ctx.stepsPerBeat) % 4;
    const isDownbeat = sub === 0 && (beatInBar === 0 || beatInBar === 2);
    const isWeakBeat = sub === 0;
    const isOffbeat = sub === Math.floor(ctx.stepsPerBeat / 2);
    const isPickup = sub === ctx.stepsPerBeat - 1;

    let midi = rootMidi;
    let velocity = 96;
    let dur = Math.round(ctx.stepTicks * 1.4);

    if (isDownbeat && ctx.rand() < 0.92) {
      velocity = 112;
      dur = Math.round(ctx.stepTicks * 1.6);
    } else if (isWeakBeat && ctx.rand() < 0.5) {
      velocity = 88;
      dur = Math.round(ctx.stepTicks * 1.1);
    } else if (isOffbeat && ctx.rand() < 0.38) {
      midi = ctx.rand() < 0.4 ? octMidi : rootMidi;
      velocity = 80;
      dur = Math.round(ctx.stepTicks * 0.9);
    } else if (isPickup && ctx.rand() < 0.3) {
      midi = ctx.rand() < 0.5 ? pickupMidi : octMidi;
      velocity = 70;
      dur = Math.round(ctx.stepTicks * 0.5);
    } else {
      continue;
    }

    const timingJitter = Math.round(jitter(ctx.rand, ctx.stepTicks * 0.02));
    out.push({
      start: step * ctx.stepTicks + swingOffset(ctx, step) + timingJitter,
      duration: dur,
      midi,
      velocity,
    });
  }
  return out;
}

function genArp(ctx: GenCtx): NoteEvent[] {
  const out: NoteEvent[] = [];
  const barTicks = PPQ * 4;

  for (let bar = 0; bar < ctx.settings.bars; bar++) {
    const rootDeg = pickWeighted(ctx.rand, ctx.weights) - 7;
    const chord = [rootDeg, rootDeg + 2, rootDeg + 4, rootDeg + 6];
    const mode = Math.floor(ctx.rand() * 3); // 0 up, 1 down, 2 pendulum
    let idx = 0;
    let dir = 1;

    for (let step = 0; step < 4 * ctx.stepsPerBeat; step++) {
      if (ctx.rand() < 0.18) continue; // leave intentional gaps
      if (ctx.rand() < 0.15) idx = mod(idx + dir, chord.length);
      else if (ctx.rand() < 0.3) dir = -dir;

      const degree = chord[mod(idx, chord.length)];
      const oct = ctx.rand() < 0.12 ? 1 : 0;
      const midi = clampMidi(degreeMidi(ctx, degree, oct));

      out.push({
        start: bar * barTicks + step * ctx.stepTicks + swingOffset(ctx, step),
        duration: Math.round(ctx.stepTicks * 0.8),
        midi,
        velocity: Math.round(72 + ctx.rand() * 22),
      });

      if (mode === 0) idx += 1;
      else if (mode === 1) idx -= 1;
      else {
        idx += dir;
        if (idx < 0 || idx >= chord.length) {
          dir = -dir;
          idx += dir;
        }
      }
    }
  }
  return out;
}

function genSynth(ctx: GenCtx): NoteEvent[] {
  const out: NoteEvent[] = [];
  const barTicks = PPQ * 4;

  // A sparse dungeon-synth voice: one or two long tones per bar,
  // deliberately leaving air between phrases.
  for (let bar = 0; bar < ctx.settings.bars; bar++) {
    const base = pickWeighted(ctx.rand, ctx.weights) - 7;
    const notes = [base, base + (ctx.rand() < 0.65 ? 2 : 4)];
    const firstStart = bar * barTicks;
    const firstDur = Math.round(barTicks * (0.58 + ctx.rand() * 0.18));

    out.push({
      start: firstStart,
      duration: firstDur,
      midi: clampMidi(degreeMidi(ctx, notes[0], -1)),
      velocity: Math.round(42 + ctx.rand() * 12),
    });

    if (ctx.rand() < 0.62) {
      out.push({
        start: firstStart + Math.round(barTicks * 0.52),
        duration: Math.round(barTicks * (0.28 + ctx.rand() * 0.18)),
        midi: clampMidi(degreeMidi(ctx, notes[1], -1)),
        velocity: Math.round(34 + ctx.rand() * 12),
      });
    }
  }
  return out;
}

function genDrums(ctx: GenCtx): NoteEvent[] {
  const out: NoteEvent[] = [];
  const barSteps = 4 * ctx.stepsPerBeat;
  let blastBar = false;

  for (let step = 0; step < ctx.totalSteps; step++) {
    const posInBar = step % barSteps;
    if (posInBar === 0) {
      blastBar = ctx.rand() < 0.3;
      out.push({
        start: step * ctx.stepTicks,
        duration: Math.round(ctx.stepTicks * 3),
        midi: DRUM_NOTES.crash,
        velocity: Math.round(90 + ctx.rand() * 20),
      });
    }

    const sub = step % ctx.stepsPerBeat;
    const beatInBar = Math.floor(posInBar / ctx.stepsPerBeat) % 4;
    const isDownbeat = sub === 0;
    const isBackbeat = isDownbeat && (beatInBar === 1 || beatInBar === 3);
    const timingJitter = Math.round(jitter(ctx.rand, ctx.stepTicks * 0.015));
    const start = step * ctx.stepTicks + swingOffset(ctx, step) + timingJitter;

    if (blastBar) {
      // Classic blast beat: kick and snare alternate on every subdivision.
      const hitsSnare = sub % 2 === 1;
      out.push({
        start,
        duration: Math.round(ctx.stepTicks * 0.9),
        midi: hitsSnare ? DRUM_NOTES.snare : DRUM_NOTES.kick,
        velocity: Math.round(clamp(100 + ctx.rand() * 20, 1, 127)),
      });
      if (ctx.rand() < 0.5) {
        out.push({
          start,
          duration: Math.round(ctx.stepTicks * 0.5),
          midi: DRUM_NOTES.closedHat,
          velocity: Math.round(60 + ctx.rand() * 20),
        });
      }
      continue;
    }

    // Trap-style hats: near-constant sixteenths, with the odd roll and open-hat accent.
    if (ctx.rand() < 0.88) {
      const isLastInBeat = sub === ctx.stepsPerBeat - 1;
      const roll = isLastInBeat && ctx.rand() < 0.18;
      const useOpen = !roll && isLastInBeat && ctx.rand() < 0.3;
      out.push({
        start,
        duration: Math.round(ctx.stepTicks * (useOpen ? 1.6 : 0.45)),
        midi: useOpen ? DRUM_NOTES.openHat : DRUM_NOTES.closedHat,
        velocity: Math.round((isDownbeat ? 92 : 66) + ctx.rand() * 18),
      });
      if (roll) {
        const rollTicks = ctx.stepTicks / 2;
        out.push({
          start: start + rollTicks,
          duration: Math.round(rollTicks * 0.8),
          midi: DRUM_NOTES.closedHat,
          velocity: Math.round(70 + ctx.rand() * 15),
        });
      }
    }

    if (isBackbeat) {
      out.push({
        start,
        duration: Math.round(ctx.stepTicks * 1.1),
        midi: DRUM_NOTES.snare,
        velocity: Math.round(clamp(108 + ctx.rand() * 16, 1, 127)),
      });
    } else if (isDownbeat && beatInBar === 0 && ctx.rand() < 0.95) {
      out.push({
        start,
        duration: Math.round(ctx.stepTicks * 1.1),
        midi: DRUM_NOTES.kick,
        velocity: Math.round(clamp(112 + ctx.rand() * 14, 1, 127)),
      });
    } else if (ctx.rand() < 0.16) {
      // Syncopated kick pickup or ghost snare.
      const ghostSnare = ctx.rand() < 0.3;
      out.push({
        start,
        duration: Math.round(ctx.stepTicks * 0.8),
        midi: ghostSnare ? DRUM_NOTES.snare : DRUM_NOTES.kick,
        velocity: Math.round((ghostSnare ? 55 : 90) + ctx.rand() * 14),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loop generation & mutation
// ---------------------------------------------------------------------------

export function generateLoop(settings: GeneratorSettings, seed: string = randomSeed()): Loop {
  const rand = mulberry32(hashSeed(seed));
  const ctx = makeCtx(settings, rand);

  const notes: Record<TrackId, NoteEvent[]> = {
    lead: settings.tracks.lead ? genLead(ctx) : [],
    pad: settings.tracks.pad ? genPad(ctx) : [],
    bass: settings.tracks.bass ? genBass(ctx) : [],
    arp: settings.tracks.arp ? genArp(ctx) : [],
    synth: settings.tracks.synth ? genSynth(ctx) : [],
    drums: settings.tracks.drums ? genDrums(ctx) : [],
  };

  return { seed, notes, settings, createdAt: Date.now() };
}

function mapTracks(
  tracks: Record<TrackId, NoteEvent[]>,
  fn: (track: TrackId, list: NoteEvent[]) => NoteEvent[],
): Record<TrackId, NoteEvent[]> {
  return {
    lead: fn("lead", tracks.lead),
    pad: fn("pad", tracks.pad),
    bass: fn("bass", tracks.bass),
    arp: fn("arp", tracks.arp),
    synth: fn("synth", tracks.synth),
    drums: fn("drums", tracks.drums),
  };
}

function noteToDegree(ctx: GenCtx, midi: number): { idx: number; octave: number } {
  const rel = midi - ctx.rootMidi;
  const octave = Math.floor(rel / 12);
  const pc = mod(rel, 12);
  const idx = ctx.intervals.indexOf(pc);
  return { idx, octave };
}

function degreeToMidi(ctx: GenCtx, idx: number, octave: number): number {
  const len = ctx.intervals.length;
  const i = mod(idx, len);
  const octUp = Math.floor(idx / len);
  return ctx.rootMidi + (octave + octUp) * 12 + ctx.intervals[i];
}

function snapToScale(ctx: GenCtx, midi: number): number {
  const rel = midi - ctx.rootMidi;
  const octave = Math.floor(rel / 12);
  const pc = mod(rel, 12);
  let best = ctx.intervals[0];
  let bestDist = Infinity;
  for (const iv of ctx.intervals) {
    const d = Math.abs(iv - pc);
    if (d < bestDist) {
      bestDist = d;
      best = iv;
    }
  }
  return clampMidi(ctx.rootMidi + octave * 12 + best);
}

/** Randomly alter ~amount of notes to neighboring scale degrees. */
export function mutateLoop(
  loop: Loop,
  amount = 0.1,
  random: () => number = Math.random,
): Loop {
  const ctx = makeCtx(loop.settings, random);
  const notes = mapTracks(loop.notes, (track, list) => {
    // Drum hits use GM percussion note numbers, not scale degrees — leave them alone.
    if (track === "drums") return list;
    return list.map((n) => {
      if (random() > amount) return n;
      const { idx, octave } = noteToDegree(ctx, n.midi);
      if (idx < 0) return n;
      const delta = random() < 0.5 ? -1 : 1;
      return { ...n, midi: clampMidi(degreeToMidi(ctx, idx + delta, octave)) };
    });
  });
  return { ...loop, notes };
}

/** Mirror pitches around the scale axis (root + octave), snapping back to scale. */
export function invertLoop(loop: Loop): Loop {
  const ctx = makeCtx(loop.settings, Math.random);
  const axis = ctx.rootMidi + 12;
  const notes = mapTracks(loop.notes, (track, list) => {
    if (track === "drums") return list;
    return list.map((n) => ({ ...n, midi: snapToScale(ctx, Math.round(2 * axis - n.midi)) }));
  });
  return { ...loop, notes };
}
