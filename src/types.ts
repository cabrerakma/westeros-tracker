// Data model (spec section 7). Static data is separate from mutable GameState.
export type FactionId = string; // e.g. "stark", "neutral"
export type TerritoryId = string; // e.g. "winterfell"
export type RegionId = string; // e.g. "the-north"

export interface Faction {
  id: FactionId;
  name: string;
  color: string; // hex
  altColor?: string; // color-blind-safe override
  glyph: string; // id in glyphs.json; "none" is built in
  isPlayer: boolean;
  playerName?: string;
}

export interface Region {
  id: RegionId;
  name: string;
  labelPos: [number, number];
  labelSize?: number; // font size in map units (default 32)
  labelRotate?: number; // degrees
}

export type Tier = "city" | "fortress" | "castle" | "holdfast";

export interface Territory {
  id: TerritoryId;
  name: string;
  seatHouse: string;
  region: RegionId;
  homeFaction: FactionId; // may be "neutral" (the Vale)
  tier: Tier;
  seat: [number, number];
  path?: string; // merged from territories.geo.json (generated in M1)
  adjacent: TerritoryId[]; // land and sea links, symmetric
}

export interface TerritoryState {
  holder: FactionId;
  note?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601
  territory?: TerritoryId;
  action: string; // "holder-changed", "battle-recorded", "undo", ...
  from?: string;
  to?: string;
  note?: string;
}

export interface Battle {
  id: string;
  timestamp: string; // when it was recorded; the date is what the history shows
  territory: TerritoryId;
  attacker: { faction: FactionId; players: string[] };
  defender: { faction: FactionId; players: string[] };
  outcome: "captured" | "repelled" | "draw";
  holderBefore: FactionId;
  holderAfter: FactionId; // equals holderBefore unless captured
  note?: string;
}

export interface GameState {
  version: 1;
  scenarioId: string;
  territories: Record<TerritoryId, TerritoryState>;
  factions: Faction[]; // state copy so GM edits persist
  log: LogEntry[];
  battles: Battle[]; // the only store of battles
}

export interface Scenario {
  id: string;
  name: string;
  factions: Faction[];
  territories: Record<TerritoryId, TerritoryState>;
}
