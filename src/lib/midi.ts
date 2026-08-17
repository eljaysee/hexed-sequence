// Minimal standard MIDI file (format 1) encoder.
// Produces a conductor track (tempo/time signature) plus one track per enabled
// stem, each routed to its own MIDI channel (lead=1, pad=2, bass=3, arp=4).

import { PPQ, type Loop, type TrackId } from "./music";

interface MidiEvent {
  tick: number;
  data: number[];
}

function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function metaText(type: number, text: string): number[] {
  const bytes = Array.from(text).map((c) => c.charCodeAt(0));
  return [0xff, type, bytes.length, ...bytes];
}

function endOfTrack(): number[] {
  return [0xff, 0x2f, 0x00];
}

function encodeTrack(events: MidiEvent[]): Uint8Array {
  const body: number[] = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick);
    body.push(...vlq(delta), ...ev.data);
    lastTick = ev.tick;
  }
  return new Uint8Array(body);
}

function chunk(type: "MThd" | "MTrk", data: Uint8Array): number[] {
  const header = Array.from(type).map((c) => c.charCodeAt(0));
  const len = data.length;
  return [
    ...header,
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...data,
  ];
}

function clampByte(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

const STEM_TRACKS: { id: TrackId; channel: number; name: string }[] = [
  { id: "lead", channel: 0, name: "Lead" },
  { id: "pad", channel: 1, name: "Pad" },
  { id: "bass", channel: 2, name: "Bass" },
  { id: "arp", channel: 3, name: "Arp" },
  { id: "synth", channel: 4, name: "Dungeon Synth" },
  // Channel 9 (10 in 1-indexed DAW UIs) is the General MIDI percussion channel.
  { id: "drums", channel: 9, name: "Drums" },
];

export function buildMidi(loop: Loop): Uint8Array {
  const bpm = loop.settings.bpm;
  const enabled = STEM_TRACKS.filter((t) => loop.notes[t.id].length > 0);
  const tempo = Math.round(60_000_000 / bpm);

  const tracks: MidiEvent[][] = [];

  // Conductor track: name, tempo, 4/4 time signature.
  tracks.push([
    { tick: 0, data: metaText(0x03, "Hexed Sequence") },
    {
      tick: 0,
      data: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff],
    },
    { tick: 0, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
    { tick: 0, data: endOfTrack() },
  ]);

  for (const stem of enabled) {
    const events: MidiEvent[] = [{ tick: 0, data: metaText(0x03, stem.name) }];
    const notes: MidiEvent[] = [];

    for (const n of loop.notes[stem.id]) {
      const midi = clampByte(n.midi, 0, 127);
      const velocity = clampByte(n.velocity, 1, 127);
      const startTick = Math.max(0, Math.round(n.start));
      notes.push({
        tick: startTick,
        data: [0x90 | stem.channel, midi, velocity],
      });
      notes.push({
        tick: startTick + Math.max(1, Math.round(n.duration)),
        data: [0x80 | stem.channel, midi, 0],
      });
    }

    notes.sort((a, b) => a.tick - b.tick);
    events.push(...notes);
    events.push({
      tick: notes.length ? notes[notes.length - 1].tick : 0,
      data: endOfTrack(),
    });
    tracks.push(events);
  }

  const chunks: number[] = [];
  // Header chunk: format 1, n tracks, PPQ division.
  chunks.push(...chunk("MThd", new Uint8Array([0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 0xff, PPQ & 0xff])));
  for (const track of tracks) {
    chunks.push(...chunk("MTrk", encodeTrack(track)));
  }

  return new Uint8Array(chunks);
}

export function downloadMidi(loop: Loop): void {
  const bytes = buildMidi(loop);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hexed-sequence-${loop.seed.toLowerCase()}-${loop.settings.bpm}bpm.mid`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
