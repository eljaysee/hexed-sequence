import { motion } from "framer-motion";
import {
  Activity,
  AudioWaveform,
  Download,
  Flame,
  Hexagon,
  Play,
  Shuffle,
  Skull,
  Sparkles,
  Waves,
} from "lucide-react";
import { Link } from "react-router";
import { HexLogo, HexSigil } from "@/components/HexLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const GENERATORS = [
  {
    icon: Flame,
    name: "TREMOLO LEAD",
    description:
      "High-speed 16th/32nd runs with alternating pick accents and octave jumps — the black-metal shriek.",
    color: "text-red-500",
    border: "border-red-500/40",
  },
  {
    icon: Waves,
    name: "DUNGEON PAD",
    description:
      "Sustained block chords weighted toward the b2 and b5 for that cold, witch-house dread.",
    color: "text-violet-400",
    border: "border-violet-400/40",
  },
  {
    icon: AudioWaveform,
    name: "808 BASSLINE",
    description:
      "Low-octave root pulses, syncopated sub hits, and rapid pickup notes straight out of the trap.",
    color: "text-orange-400",
    border: "border-orange-400/40",
  },
  {
    icon: Hexagon,
    name: "HEX ARP",
    description:
      "Chaotic, pendulum-swept arpeggios tuned for haunted textures and shimmering dread.",
    color: "text-teal-300",
    border: "border-teal-300/40",
  },
  {
    icon: Sparkles,
    name: "DUNGEON SYNTH",
    description:
      "Sparse, mournful sustained tones with cold harmonic color — more atmosphere, less wall of notes.",
    color: "text-violet-300",
    border: "border-violet-300/40",
  },
  {
    icon: Skull,
    name: "DRUMS",
    description:
      "Kick, snare, hats and crashes with black-metal blast energy and trap-style syncopation.",
    color: "text-yellow-300",
    border: "border-yellow-300/40",
  },
];

const SCALES = [
  "Harmonic Minor",
  "Phrygian Dominant",
  "Locrian",
  "Double Harmonic",
  "Hungarian Minor",
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

function StepGrid() {
  return (
    <div className="grid grid-cols-8 gap-1" aria-hidden="true">
      {Array.from({ length: 40 }).map((_, i) => {
        const on = [0, 2, 5, 7, 10, 13, 16, 20, 23, 27, 30, 34, 37].includes(i);
        const acc = [7, 16, 23, 34].includes(i);
        return (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-[1px] ${
              on
                ? acc
                  ? "bg-red-500"
                  : "bg-red-500/50"
                : "bg-white/[0.06]"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="hexed-scanlines" aria-hidden="true" />

      {/* NAV */}
      <header className="sticky top-0 z-20 border-b border-border bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="transition-opacity hover:opacity-80">
            <HexLogo />
          </Link>

          <div className="flex items-center gap-2">
            <Button
              asChild
              className="bg-red-600 font-bold tracking-widest text-white hover:bg-red-500"
            >
              <Link to="/studio">
                <Play className="size-4 fill-current" />
                STUDIO
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, rgba(255,45,63,0.35), transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="mb-5 gap-1.5 border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] tracking-[0.25em] text-red-400">
              <Skull className="size-3" />
              BLACK METAL × TRAP × WITCH HOUSE
            </Badge>
            <h1 className="hexed-glow text-5xl font-black leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              SUMMON
              <br />
              <span className="text-red-500">DARK</span> MIDI
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-7 text-muted-foreground">
              Hexed Sequence fuses black metal&apos;s rapid minor-scale intensity
              with trap and witch-house syncopation. Tweak the scales, mutate the
              pattern, audition it through a lo-fi synth, and export clean
              multi-track MIDI into your DAW.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-red-600 font-black tracking-widest text-white hover:bg-red-500"
              >
                <Link to="/studio">
                  <Sparkles className="size-4" />
                  SUMMON A SEQUENCE
                </Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] tracking-wider text-muted-foreground">
              <span>110–170 BPM</span>
              <span>5 DARK SCALES</span>
              <span>6 GENERATORS</span>
              <span>6-TRACK MIDI</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative"
          >
            <div className="relative rounded-md border border-border bg-card/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-[0.25em] text-red-500/90">
                  LIVE STEP GRID
                </span>
                <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-red-500" />
                  SEED 4D3A0F
                </span>
              </div>
              <StepGrid />
              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4 text-[10px] tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3.5 text-red-400" /> 140 BPM
                </span>
                <span className="flex items-center gap-1.5">
                  <Shuffle className="size-3.5 text-red-400" /> MUTATE 10%
                </span>
                <span className="flex items-center gap-1.5">
                  <Download className="size-3.5 text-red-400" /> MIDI STEMS
                </span>
              </div>
            </div>
            <HexSigil className="absolute -right-6 -top-6 size-16 opacity-30" />
          </motion.div>
        </div>
      </section>

      {/* MACHINES */}
      <section id="machines" className="border-t border-border bg-black/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <motion.div {...fadeUp} className="mb-12 max-w-2xl">
            <p className="mb-3 text-[10px] font-bold tracking-[0.3em] text-red-500">
              THE MACHINES
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Four stems. One unholy loop.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Every generator is routed to its own MIDI channel, so the tremolo
              lead, dungeon pad, 808 bass, and hex arp stay separate when they
              hit your DAW.
            </p>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-2">
            {GENERATORS.map((g, i) => (
              <motion.div
                key={g.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className={`rounded-md border ${g.border} bg-card/40 p-6`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <g.icon className={`size-6 ${g.color}`} />
                  <span className={`text-[10px] font-bold tracking-[0.2em] ${g.color}`}>
                    CH {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-black tracking-tight">{g.name}</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  {g.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SIGNAL CHAIN */}
      <section id="signal" className="border-t border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <p className="mb-3 text-[10px] font-bold tracking-[0.3em] text-red-500">
              SIGNAL CHAIN
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Lo-fi, but on purpose.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              The internal synth runs oscillators through a bitcrusher, a
              wave-shaper distortion stage, and a low-pass filter — so you can
              audition a loop already sounding like tape-decayed industrial
              noise before exporting the clean MIDI.
            </p>
            <ul className="mt-6 space-y-3 text-[13px] tracking-wide">
              {[
                "Sample-rate reduction for 8-bit grit",
                "Drive stage for harsh, saturated texture",
                "Sweepable low-pass from dungeon-dark to shriek-bright",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-muted-foreground">
                  <span className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-red-500" />
                  {line}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55 }}
            className="rounded-md border border-border bg-card/40 p-6"
          >
            <p className="mb-4 text-[10px] font-bold tracking-[0.25em] text-red-500/90">
              AUDIO NODE GRAPH
            </p>
            {[
              "OSCILLATORS",
              "BITCRUSHER",
              "DISTORTION",
              "LOW-PASS",
              "MASTER",
            ].map((node) => (
              <div key={node} className="mb-2 flex-1 rounded-sm border border-red-500/40 bg-black/40 px-4 py-3 text-[11px] font-bold tracking-[0.25em] text-foreground last:mb-0">
                {node}
              </div>
            ))}
          </motion.div>
        </div>
      </section>


      {/* SCALES STRIP */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-10">
          <span className="text-[10px] font-bold tracking-[0.25em] text-muted-foreground">
            PRESET SCALES
          </span>
          {SCALES.map((scale) => (
            <span
              key={scale}
              className="rounded-sm border border-border bg-black/40 px-3 py-1.5 text-[11px] font-bold tracking-wider text-foreground"
            >
              {scale.toUpperCase()}
            </span>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border bg-black/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
          <motion.div {...fadeUp} className="max-w-2xl">
            <HexSigil className="mx-auto mb-6 size-14" />
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
              The darkness is already in your head.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Put it on the grid. No accounts and no backend — everything runs
              in your browser, and your favorite seeds stay saved locally.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-red-600 font-black tracking-widest text-white hover:bg-red-500"
              >
                <Link to="/studio">
                  <Sparkles className="size-4" />
                  ENTER THE STUDIO
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[10px] tracking-[0.2em] text-muted-foreground sm:flex-row">
          <HexLogo sigilClassName="size-5" />
          <p>BLACK METAL / TRAP MIDI GENERATOR — BUILT IN THE DARK</p>
        </div>
      </footer>
    </div>
  );
}
