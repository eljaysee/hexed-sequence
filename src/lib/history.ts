// localStorage persistence for Hexed Sequence: seed history/favorites plus the
// user's last settings and audio FX state.

import {
  DEFAULT_SETTINGS,
  type GeneratorSettings,
  type Loop,
} from "./music";
import { DEFAULT_FX, type FxParams } from "./audio";

export interface HistoryEntry extends Loop {
  id: string;
  name: string;
  favorited: boolean;
}

const HISTORY_KEY = "hexed-sequence:history";
const SETTINGS_KEY = "hexed-sequence:settings";
const FX_KEY = "hexed-sequence:fx";
const MAX_ENTRIES = 40;

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.seed === "string" &&
    typeof o.name === "string" &&
    typeof o.notes === "object" &&
    o.notes !== null &&
    typeof o.settings === "object" &&
    o.settings !== null
  );
}

function readJson<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or unavailable; fail silently for non-critical data.
  }
}

export function loadHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function persistHistory(entries: HistoryEntry[]): void {
  writeJson(HISTORY_KEY, entries.slice(0, MAX_ENTRIES));
}

export function makeEntry(loop: Loop, name?: string): HistoryEntry {
  return {
    ...loop,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name ?? `Seed ${loop.seed}`,
    favorited: false,
  };
}

function isSettings(value: unknown): value is GeneratorSettings {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.bpm === "number" &&
    typeof o.root === "number" &&
    typeof o.scale === "string" &&
    typeof o.bars === "number" &&
    Array.isArray(o.mask) &&
    typeof o.tracks === "object" &&
    o.tracks !== null
  );
}

export function loadSettings(): GeneratorSettings {
  const loaded = readJson(SETTINGS_KEY, isSettings);
  if (!loaded) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    tracks: { ...DEFAULT_SETTINGS.tracks, ...loaded.tracks },
  };
}

export function persistSettings(settings: GeneratorSettings): void {
  writeJson(SETTINGS_KEY, settings);
}

function isFx(value: unknown): value is FxParams {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.drive === "number" &&
    typeof o.bits === "number" &&
    typeof o.downsample === "number" &&
    typeof o.cutoff === "number" &&
    typeof o.volume === "number"
  );
}

export function loadFx(): FxParams {
  const loaded = readJson(FX_KEY, isFx);
  return loaded ? { ...DEFAULT_FX, ...loaded } : DEFAULT_FX;
}

export function persistFx(fx: FxParams): void {
  writeJson(FX_KEY, fx);
}
