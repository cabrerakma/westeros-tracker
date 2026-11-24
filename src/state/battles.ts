import { TERRITORIES } from "../data";
import type { Battle, Faction, FactionId, TerritoryId } from "../types";

/** Battles on one territory, newest first. */
export function battlesFor(battles: Battle[], territory: TerritoryId): Battle[] {
  return battles
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.territory === territory)
    .sort((x, y) => (y.b.timestamp < x.b.timestamp ? -1 : y.b.timestamp > x.b.timestamp ? 1 : y.i - x.i))
    .map(({ b }) => b);
}

/** Derived, never stored: how often a territory was fought over and how often it changed hands. */
export function territoryStats(battles: Battle[], territory: TerritoryId) {
  const here = battles.filter((b) => b.territory === territory);
  return { fought: here.length, changedHands: here.filter((b) => b.outcome === "captured" && b.holderAfter !== b.holderBefore).length };
}

/** Every player name used so far, for suggestions in the form. */
export function knownPlayers(battles: Battle[]): string[] {
  const names = new Set<string>();
  for (const b of battles) for (const p of [...b.attacker.players, ...b.defender.players]) names.add(p);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export const parsePlayers = (text: string): string[] =>
  text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

export const factionLabel = (factions: Faction[], id: FactionId): string => (id === "neutral" ? "Unclaimed" : (factions.find((f) => f.id === id)?.name.replace(/^House /, "") ?? id));

export const territoryName = (id: TerritoryId): string => TERRITORIES.find((t) => t.id === id)?.name ?? id;

/** "YYYY-MM-DD" for a date input, in local time. */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Noon local time on that day, so the date never shifts with the timezone. */
export function fromDateInput(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12).toISOString();
}
