import type { Faction, FactionId, Region, Territory } from "../types";

export type ControlState = "controlled" | "occupied" | "unclaimed";

/** Spec section 5. Unclaimed always wins over Occupied, so a blank scenario shows no rings. */
export function controlState(holder: FactionId, homeFaction: FactionId): ControlState {
  if (holder === "neutral") return "unclaimed";
  return holder === homeFaction ? "controlled" : "occupied";
}

export function shortFactionName(f: Pick<Faction, "name">): string {
  const paren = /\(([^)]+)\)/.exec(f.name);
  if (paren) return paren[1];
  return f.name.replace(/^House /, "").replace(/ without .*/, "");
}

/** "Tyrell 6/6" when one faction holds the whole region, else "Stark 7, Bolton 1". */
export function regionSummary(
  region: Region,
  territories: Territory[],
  holders: Record<string, FactionId>,
  factions: Faction[],
): string {
  const inRegion = territories.filter((t) => t.region === region.id);
  const counts = new Map<FactionId, number>();
  for (const t of inRegion) counts.set(holders[t.id], (counts.get(holders[t.id]) ?? 0) + 1);
  const name = (id: FactionId) => {
    const f = factions.find((x) => x.id === id);
    return f ? shortFactionName(f) : id;
  };
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 1) return `${name(entries[0][0])} ${entries[0][1]}/${inRegion.length}`;
  return entries.map(([id, n]) => `${name(id)} ${n}`).join(", ");
}
