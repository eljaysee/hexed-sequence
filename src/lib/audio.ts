// Lo-fi Web Audio synth engine for Hexed Sequence.
// Voice oscillators -> ScriptProcessor bitcrusher -> WaveShaper distortion ->
// BiquadFilter low-pass -> master gain -> destination.
//
// Scheduling model: rather than flattening the loop into a one-shot sorted
// queue at start() time, the engine keeps a live reference to `loop` and a
// continuous tick clock (anchorTime/anchorTick, rebased on tempo changes).
// Every lookahead poll re-reads `this.loop.notes` directly, so edits made in
// the piano roll (or a live BPM change) take effect on the very next poll —
// no stop/restart required. See setLoop() and setBpm().

import { DRUM_NOTES, PPQ, midiToFreq, type Loop, type TrackId } from "./music";

/** How far ahead of "now" we schedule audio-thread events, in seconds. */
const LOOKAHEAD = 0.2;
/** How often we poll to top up the lookahead window, in ms. */
const POLL_MS = 25;

export interface FxParams {
  /** Distortion drive, 0..1. */
  drive: number;
  /** Bit depth, 2..16. */
  bits: number;
  /** Sample-rate reduction factor, 1..16. */
  downsample: number;
  /** Low-pass cutoff in Hz, 60..8000. */
  cutoff: number;
  /** Master volume, 0..1. */
  volume: number;
  /** Bypass the bitcrusher/distortion/filter chain. */
  bypass: boolean;
}

export const DEFAULT_FX: FxParams = {
  drive: 0.35,
  bits: 8,
  downsample: 4,
  cutoff: 2400,
  volume: 0.8,
  bypass: false,
};

export interface TrackMixState {
  mute: boolean;
  solo: boolean;
  /** Extra gain multiplier on top of note velocity, 0..1.5. */
  gain: number;
}

export const DEFAULT_TRACK_MIX: Record<TrackId, TrackMixState> = {
  lead: { mute: false, solo: false, gain: 1 },
  pad: { mute: false, solo: false, gain: 1 },
  bass: { mute: false, solo: false, gain: 1 },
  arp: { mute: false, solo: false, gain: 1 },
  synth: { mute: false, solo: false, gain: 1 },
  drums: { mute: false, solo: false, gain: 1 },
};

interface Voice {
  gain: GainNode;
  oscs: (OscillatorNode | AudioBufferSourceNode)[];
  stopAt: number;
}

interface TrackVoice {
  types: OscillatorType[];
  detune: number;
  peak: number;
  attack: number;
  release: number;
}

const TRACK_VOICES: Record<TrackId, TrackVoice> = {
  lead: { types: ["sawtooth", "sawtooth"], detune: 9, peak: 0.16, attack: 0.004, release: 0.05 },
  pad: { types: ["sawtooth", "triangle"], detune: -7, peak: 0.065, attack: 0.08, release: 0.22 },
  synth: { types: ["triangle", "sine"], detune: -4, peak: 0.075, attack: 0.12, release: 0.35 },
  bass: { types: ["sine", "square"], detune: 0, peak: 0.24, attack: 0.008, release: 0.12 },
  arp: { types: ["square", "sawtooth"], detune: 5, peak: 0.12, attack: 0.003, release: 0.09 },
  // Drums are synthesized separately in triggerDrum(); this entry exists only to satisfy the type.
  drums: { types: ["sine"], detune: 0, peak: 0, attack: 0, release: 0 },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private voiceBus: GainNode | null = null;
  private crusher: ScriptProcessorNode | null = null;
  private driveNode: WaveShaperNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Live reference to the pattern being played; swapped in place by setLoop(). */
  private loop: Loop | null = null;
  private bpm = 140;
  /** Tick-clock anchor: tick `anchorTick` occurs at AudioContext time `anchorTime`.
   *  Rebased (not reset) whenever tempo changes, so the clock stays continuous. */
  private anchorTime = 0;
  private anchorTick = 0;
  /** Absolute (unwrapped) tick position scheduled up through, exclusive. */
  private lastScheduledTick = 0;
  private timer: number | null = null;
  private voices: Voice[] = [];
  private fx: FxParams = DEFAULT_FX;
  private trackMix: Record<TrackId, TrackMixState> = DEFAULT_TRACK_MIX;

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  private get loopTicks(): number {
    return this.loop ? this.loop.settings.bars * 4 * PPQ : 0;
  }

  private secondsPerTick(): number {
    return 60 / this.bpm / PPQ;
  }

  private tickAtTime(time: number): number {
    return this.anchorTick + (time - this.anchorTime) / this.secondsPerTick();
  }

  private timeAtTick(tick: number): number {
    return this.anchorTime + (tick - this.anchorTick) * this.secondsPerTick();
  }

  /** Position within the loop as a 0..1 fraction. */
  getProgress(): number {
    if (this.timer === null || this.ctx === null || this.loopTicks <= 0) return 0;
    const tick = this.tickAtTime(this.ctx.currentTime);
    const pos = ((tick % this.loopTicks) + this.loopTicks) % this.loopTicks;
    return pos / this.loopTicks;
  }

  async start(loop: Loop, bpm: number, fx: FxParams): Promise<void> {
    this.stop();
    this.ensureGraph();
    const ctx = this.ctx as AudioContext;
    if (ctx.state === "suspended") await ctx.resume();

    this.fx = { ...fx };
    this.applyFx();

    this.loop = loop;
    this.bpm = bpm;
    this.anchorTime = ctx.currentTime + 0.08;
    this.anchorTick = 0;
    this.lastScheduledTick = 0;
    this.timer = window.setInterval(() => this.schedule(), POLL_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }

    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        for (const o of v.oscs) o.stop(now + 0.06);
      } catch {
        // Ignore oscillators that were already stopped.
      }
    }
    this.voices = [];
  }

  getWaveformData(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  updateFx(fx: FxParams): void {
    this.fx = { ...fx };
    if (this.ctx) this.applyFx();
  }

  /** Update mute/solo/gain per track. Takes effect on the next scheduled hits — no restart needed. */
  updateTrackMix(mix: Record<TrackId, TrackMixState>): void {
    this.trackMix = mix;
  }

  /**
   * Hot-swap the pattern being played. The tick clock keeps running untouched —
   * the very next lookahead poll reads notes out of the new `loop` — so edits
   * made in the piano roll (add/remove/retune a note, mutate, invert) show up
   * live without stopping playback. Notes at or before the current playhead
   * position in this cycle simply won't retroactively fire; they'll play on
   * the next pass. If `loop.settings.bars`/`resolution` changed the cycle
   * length mid-bar, the wrap point adopts the new length immediately, which
   * can shorten or lengthen the *current* pass slightly — a minor, rare edge
   * case rather than a glitch.
   */
  setLoop(loop: Loop): void {
    this.loop = loop;
  }

  /**
   * Hot-change tempo. Rebases the tick/time anchor to "now" using the tempo
   * that was in effect a moment ago, then switches to the new tempo going
   * forward — so the playhead doesn't jump, it just speeds up or slows down
   * from exactly where it was.
   */
  setBpm(bpm: number): void {
    if (this.ctx && this.timer !== null) {
      const now = this.ctx.currentTime;
      this.anchorTick = this.tickAtTime(now);
      this.anchorTime = now;
    }
    this.bpm = bpm;
  }

  private ensureGraph(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;

    // Bitcrusher: bit-depth quantization + sample-and-hold rate reduction.
    this.crusher = ctx.createScriptProcessor(1024, 1, 1);
    const crusher = this.crusher;
    let hold = 0;
    let held = 0;
    crusher.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);
      const bits = Math.max(2, Math.round(this.fx.bits));
      const down = Math.max(1, Math.round(this.fx.downsample));
      const levels = Math.pow(2, bits - 1);
      for (let i = 0; i < output.length; i++) {
        if (hold === 0) {
          const q = Math.round(input[i] * levels) / levels;
          held = Math.max(-1, Math.min(1, q));
        }
        hold = (hold + 1) % down;
        output[i] = held;
      }
    };

    this.driveNode = ctx.createWaveShaper();
    this.driveNode.oversample = "4x";

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";

    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.7;

    const noiseLength = Math.round(ctx.sampleRate * 1);
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) noiseData[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noiseBuffer;

    this.voiceBus.connect(this.crusher);
    this.crusher.connect(this.driveNode);
    this.driveNode.connect(this.filter);
    this.filter.connect(this.analyser);
    this.voiceBus.connect(this.analyser);
    this.analyser.connect(this.master);
    this.master.connect(ctx.destination);

    this.applyFx();
  }

  private applyFx(): void {
    if (!this.ctx || !this.driveNode || !this.filter || !this.master) return;

    const k = 1 + this.fx.drive * 40;
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 127.5 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    this.driveNode.curve = curve;

    // Route either through the FX chain or directly to the analyser.
    try {
      this.voiceBus?.disconnect();
      this.voiceBus?.connect(this.crusher as AudioNode);
      this.voiceBus?.connect(this.analyser as AudioNode);
      if (this.fx.bypass) {
        this.crusher?.disconnect();
        this.driveNode?.disconnect();
        this.filter?.disconnect();
        this.voiceBus?.disconnect(this.crusher as AudioNode);
      } else {
        this.crusher?.connect(this.driveNode as AudioNode);
        this.driveNode?.connect(this.filter as AudioNode);
        this.filter?.connect(this.analyser as AudioNode);
      }
    } catch {
      // Audio routing can race with context shutdown; leave the current graph intact.
    }

    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(this.fx.cutoff, t, 0.03);
    this.master.gain.setTargetAtTime(this.fx.volume * 0.9, t, 0.03);
  }

  private schedule(): void {
    if (!this.ctx || this.timer === null || !this.loop) return;
    const loopTicks = this.loopTicks;
    if (loopTicks <= 0) return;

    const horizonTick = this.tickAtTime(this.ctx.currentTime + LOOKAHEAD);
    if (horizonTick <= this.lastScheduledTick) return;

    const anySolo = (Object.keys(this.trackMix) as TrackId[]).some(
      (t) => this.trackMix[t].solo,
    );
    const spt = this.secondsPerTick();
    const lastScheduledTick = this.lastScheduledTick;

    (Object.keys(this.loop.notes) as TrackId[]).forEach((track) => {
      const mix = this.trackMix[track];
      const audible = mix ? !mix.mute && (!anySolo || mix.solo) : true;
      if (!audible) return;
      const gainMul = mix ? mix.gain : 1;

      for (const n of this.loop!.notes[track]) {
        // A note at tick `n.start` repeats every `loopTicks`; find every
        // repetition that falls within (lastScheduledTick, horizonTick].
        let k = Math.floor((lastScheduledTick - n.start) / loopTicks);
        for (;;) {
          const absTick = n.start + k * loopTicks;
          if (absTick > horizonTick) break;
          if (absTick > lastScheduledTick) {
            const when = this.timeAtTick(absTick);
            this.trigger(track, n.midi, n.velocity, when, n.duration * spt, gainMul);
          }
          k++;
        }
      }
    });

    this.lastScheduledTick = horizonTick;
  }

  private trigger(
    track: TrackId,
    midi: number,
    velocity: number,
    when: number,
    duration: number,
    gainMul = 1,
  ): void {
    if (track === "drums") {
      this.triggerDrum(midi, (velocity / 127) * gainMul, when);
      return;
    }

    const ctx = this.ctx as AudioContext;
    const spec = TRACK_VOICES[track];
    const gain = ctx.createGain();
    const peak = spec.peak * (velocity / 127) * gainMul;
    const attack = spec.attack;
    const release = Math.min(spec.release, Math.max(0.02, duration * 0.6));

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    const holdEnd = when + Math.max(attack + 0.01, duration - release);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.6), holdEnd);
    gain.gain.setValueAtTime(Math.max(0.0002, peak * 0.6), holdEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);

    const freq = midiToFreq(midi);
    const oscs: OscillatorNode[] = spec.types.map((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      if (i === 1) osc.detune.value = spec.detune;
      osc.connect(gain);
      osc.start(when);
      osc.stop(when + duration + release + 0.05);
      return osc;
    });

    gain.connect(this.voiceBus as GainNode);

    this.voices.push({ gain, oscs, stopAt: when + duration + release });
    this.trimVoices();
  }

  private trimVoices(): void {
    if (this.voices.length <= 200 || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.stopAt > now);
  }

  /** Percussive synthesis for the drums track: pitched-noise/sine hits, no scale involved. */
  private triggerDrum(midi: number, vel: number, when: number): void {
    switch (midi) {
      case DRUM_NOTES.kick:
        this.triggerKick(vel, when);
        break;
      case DRUM_NOTES.snare:
        this.triggerSnare(vel, when);
        break;
      case DRUM_NOTES.openHat:
        this.triggerHat(vel, when, true);
        break;
      case DRUM_NOTES.crash:
        this.triggerHat(vel, when, true, 1.1, 4500);
        break;
      case DRUM_NOTES.closedHat:
      default:
        this.triggerHat(vel, when, false);
        break;
    }
  }

  private triggerKick(vel: number, when: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.09);

    const gain = ctx.createGain();
    const peak = Math.max(0.05, 0.95 * vel);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);

    osc.connect(gain);
    gain.connect(this.voiceBus as GainNode);
    osc.start(when);
    osc.stop(when + 0.24);

    this.voices.push({ gain, oscs: [osc], stopAt: when + 0.24 });
    this.trimVoices();
  }

  private triggerSnare(vel: number, when: number): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, when);
    noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.05, 0.75 * vel), when + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.15);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(this.voiceBus as GainNode);
    noise.start(when);
    noise.stop(when + 0.17);

    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = 190;
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, when);
    bodyGain.gain.exponentialRampToValueAtTime(Math.max(0.03, 0.35 * vel), when + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    body.connect(bodyGain);
    bodyGain.connect(this.voiceBus as GainNode);
    body.start(when);
    body.stop(when + 0.1);

    this.voices.push({ gain: noiseGain, oscs: [noise], stopAt: when + 0.17 });
    this.voices.push({ gain: bodyGain, oscs: [body], stopAt: when + 0.1 });
    this.trimVoices();
  }

  private triggerHat(
    vel: number,
    when: number,
    open: boolean,
    durationOverride?: number,
    highpassOverride?: number,
  ): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noiseBuffer) return;

    const dur = durationOverride ?? (open ? 0.22 : 0.045);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpassOverride ?? 7000;
    const gain = ctx.createGain();
    const peak = Math.max(0.03, (open ? 0.35 : 0.45) * vel);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    noise.connect(hp);
    hp.connect(gain);
    gain.connect(this.voiceBus as GainNode);
    noise.start(when);
    noise.stop(when + dur + 0.02);

    this.voices.push({ gain, oscs: [noise], stopAt: when + dur + 0.02 });
    this.trimVoices();
  }
}