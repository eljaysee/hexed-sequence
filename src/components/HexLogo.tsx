import { cn } from "@/lib/utils";

function pentagramPoints(cx: number, cy: number, r: number): string[] {
  const order = [0, 2, 4, 1, 3, 0];
  return order.map((i) => {
    const ang = ((-90 + i * 72) * Math.PI) / 180;
    return `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
  });
}

export function HexSigil({ className }: { className?: string }) {
  const points = pentagramPoints(12, 12, 10).join(" ");
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0 text-red-500", className)}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.6"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

export function HexLogo({ sigilClassName }: { sigilClassName?: string }) {
  return (
    <div className="flex items-center gap-3">
      <HexSigil className={sigilClassName ?? "size-8"} />
      <div className="text-left">
        <h1 className="hexed-glow text-sm font-black tracking-[0.35em] text-red-500">
          HEXED SEQUENCE
        </h1>
        <p className="text-[9px] tracking-[0.28em] text-muted-foreground">
          BLACK METAL / TRAP MIDI GENERATOR
        </p>
      </div>
    </div>
  );
}
