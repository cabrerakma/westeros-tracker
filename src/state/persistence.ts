import type { GameState } from "../types";
import { normalizeState } from "./game";

const KEY = "westeros-tracker-state-v1";

/** Saved state from this browser, or null (nothing saved, unreadable, or an unknown version). Never throws. */
export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or blocked (private window); the map still works, it just will not persist.
  }
}

/** Download the full state as a JSON file (used as the backup before a reset). */
export function downloadBackup(state: GameState, label = "westeros-backup"): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  a.href = url;
  a.download = `${label}-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
