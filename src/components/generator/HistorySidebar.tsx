import { useState } from "react";
import { Copy, Star, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NOTE_NAMES, getScale } from "@/lib/music";
import type { HistoryEntry } from "@/lib/history";

interface HistorySidebarProps {
  entries: HistoryEntry[];
  currentSeed: string;
  onRecall: (entry: HistoryEntry) => void;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCopySeed: (seed: string) => void;
}

function EditableName({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim()) onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            if (draft.trim()) onCommit(draft.trim());
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-6 w-full min-w-0 border-red-500/50 px-1.5 text-xs"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
      className="truncate text-left text-xs font-bold text-foreground hover:text-red-400"
      title="Click to rename"
    >
      {value}
    </button>
  );
}

export function HistorySidebar({
  entries,
  currentSeed,
  onRecall,
  onToggleFavorite,
  onRename,
  onDelete,
  onCopySeed,
}: HistorySidebarProps) {
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const visible = tab === "all" ? entries : entries.filter((e) => e.favorited);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card/40">
      <div className="border-b border-border/70 px-4 py-2.5">
        <h2 className="text-[10px] font-bold tracking-[0.25em] text-muted-foreground">
          SEED HISTORY
        </h2>
        <div className="mt-2 flex gap-1">
          {(["all", "favorites"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-sm border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                tab === t
                  ? "border-red-500 bg-red-500/15 text-red-400"
                  : "border-border bg-black/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : "Favorites"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            {tab === "favorites"
              ? "No favorited sequences yet."
              : "No sequences summoned yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {visible.map((entry) => {
              const isCurrent = entry.seed === currentSeed;
              const scale = getScale(entry.settings.scale);
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "group relative px-3 py-2.5 transition-colors",
                    isCurrent ? "bg-red-500/10" : "hover:bg-white/[0.03]",
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onRecall(entry)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onRecall(entry);
                    }}
                    className="block w-full cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <EditableName
                        value={entry.name}
                        onCommit={(name) => onRename(entry.id, name)}
                      />
                      {isCurrent && (
                        <span className="rounded-sm bg-red-500 px-1 py-px text-[8px] font-bold text-black">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono text-red-400/80">{entry.seed}</span>
                      <span>{entry.settings.bpm} BPM</span>
                      <span>
                        {NOTE_NAMES[entry.settings.root]} · {scale.name}
                      </span>
                    </div>
                  </div>

                  <div className="absolute right-2 top-2 flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(entry.id);
                      }}
                      title={entry.favorited ? "Unfavorite" : "Favorite"}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-sm border border-border",
                        entry.favorited
                          ? "text-yellow-400"
                          : "text-muted-foreground hover:text-yellow-400",
                      )}
                    >
                      <Star
                        className="size-3"
                        fill={entry.favorited ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopySeed(entry.seed);
                      }}
                      title="Copy seed"
                      className="flex size-6 items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(entry.id);
                      }}
                      title="Delete"
                      className="flex size-6 items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
