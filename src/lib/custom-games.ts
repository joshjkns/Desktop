// User-added applications for the Games page — anything games.json doesn't
// know about (a non-Steam/Epic/Riot game, an emulator, a creative app that
// wants its own DPI) added by picking its executable or typing its process
// name (pages/GamesPage.tsx). Persisted the same way as lib/game-profiles.ts
// — plain localStorage, subscribe/emit — and merged into the watcher's game
// list (hooks/use-game-watcher.ts), so "Running" detection and profile
// auto-apply treat them exactly like a catalog game: both only ever match on
// `executables`, the lowercased process base name running_process_names
// reports.

import { invoke } from "@tauri-apps/api/core";
import type { Game } from "../hooks/use-game-watcher";

const STORAGE_KEY = "openmouse:custom-games";
// Prefixed so a custom entry's id can never collide with a games.json `id`
// — profiles (lib/game-profiles.ts) are keyed by it.
const ID_PREFIX = "custom:";

export interface CustomGame {
  id: string;
  name: string;
  /** Full path as picked, if added via the file picker. Display only. */
  path?: string;
  /** Process base name to match, lowercased (e.g. "osu!.exe"). */
  executable: string;
  /** The OS's icon for `path`, as a PNG data URL (games.rs `app_icon_png`). */
  icon?: string;
}

type Listener = (games: CustomGame[]) => void;

function load(): CustomGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomGame[]) : [];
  } catch {
    return [];
  }
}

let customGames: CustomGame[] = load();
const listeners = new Set<Listener>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customGames));
  } catch {
    // Best-effort, same as game-profiles.ts.
  }
}

function emit() {
  for (const listener of listeners) listener(customGames);
}

export function isCustomGameId(id: string): boolean {
  return id.startsWith(ID_PREFIX);
}

/**
 * Turns a picked path or a typed name into what the process list will
 * report. Windows paths and bare names keep their ".exe"; a macOS ".app"
 * bundle runs as the binary in Contents/MacOS, which by convention shares
 * the bundle's name.
 */
export function parseExecutableInput(input: string): { executable: string; name: string } | null {
  const trimmed = input.trim().replace(/^"(.*)"$/, "$1").replace(/[\\/]+$/, "");
  if (!trimmed) return null;
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed;
  if (!base) return null;
  const stem = base.replace(/\.(exe|app)$/i, "");
  const executable = /\.app$/i.test(base) ? stem : base;
  return { executable: executable.toLowerCase(), name: stem };
}

/**
 * The OS's own icon for an application on disk, as a data URL, or undefined
 * if it can't be read (path gone, no icon) — the card falls back to a letter.
 */
export async function fetchAppIcon(path: string): Promise<string | undefined> {
  try {
    const png = await invoke<number[]>("app_icon_png", { path });
    const bytes = new Uint8Array(png);
    let binary = "";
    // Chunked: String.fromCharCode(...bytes) overflows the argument limit on a 256px icon.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}

export function addCustomGame(entry: { name: string; executable: string; path?: string; icon?: string }): CustomGame {
  const executable = entry.executable.toLowerCase();
  const existing = customGames.find((game) => game.executable === executable);
  if (existing) return existing;
  const game: CustomGame = {
    id: `${ID_PREFIX}${executable}`,
    name: entry.name.trim() || executable,
    path: entry.path,
    executable,
    icon: entry.icon,
  };
  customGames = [...customGames, game];
  persist();
  emit();
  return game;
}

export function removeCustomGame(id: string): void {
  if (!customGames.some((game) => game.id === id)) return;
  customGames = customGames.filter((game) => game.id !== id);
  persist();
  emit();
}

// Entries saved with a path but no icon (added before icons existed, or the
// lookup failed at the time) get one more try per launch.
let backfilled = false;
function backfillIcons() {
  if (backfilled) return;
  backfilled = true;
  for (const game of customGames) {
    if (game.icon || !game.path) continue;
    void fetchAppIcon(game.path).then((icon) => {
      if (!icon) return;
      customGames = customGames.map((g) => (g.id === game.id ? { ...g, icon } : g));
      persist();
      emit();
    });
  }
}

/** Returns an unsubscribe function. Immediately calls `listener` with the current list. */
export function subscribeCustomGames(listener: Listener): () => void {
  listeners.add(listener);
  listener(customGames);
  backfillIcons();
  return () => listeners.delete(listener);
}

/** The shape the rest of the Games pipeline consumes. */
export function toGame(custom: CustomGame): Game {
  return {
    id: custom.id,
    name: custom.name,
    executables: [custom.executable],
    custom: true,
    path: custom.path,
    icon: custom.icon,
  };
}
