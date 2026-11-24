import { DEFAULT_SCENARIO_ID, SCENARIOS, TERRITORIES } from "../data";
import type { Faction, FactionId, GameState, LogEntry, TerritoryId } from "../types";

/** All changes go through this reducer, so every one is undoable and logged. */
export interface History {
  past: GameState[];
  present: GameState;
  future: GameState[];
}

interface Meta {
  id: string; // new log entry id
  at: string; // ISO timestamp (passed in so the reducer stays pure)
}

export type Action =
  | ({ type: "setHolder"; territory: TerritoryId; holder: FactionId } & Meta)
  | ({ type: "setNote"; territory: TerritoryId; note: string } & Meta)
  | ({ type: "loadScenario"; scenarioId: string } & Meta)
  | ({ type: "undo" } & Meta)
  | ({ type: "redo" } & Meta);

const MAX_HISTORY = 200;

export function newMeta(): Meta {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
  return { id, at: new Date().toISOString() };
}

export function initialState(scenarioId: string = DEFAULT_SCENARIO_ID): GameState {
  const scenario = SCENARIOS[scenarioId] ?? SCENARIOS[DEFAULT_SCENARIO_ID];
  return {
    version: 1,
    scenarioId: scenario.id,
    territories: Object.fromEntries(TERRITORIES.map((t) => [t.id, { holder: scenario.territories[t.id]?.holder ?? "neutral" }])),
    factions: scenario.factions.map((f) => ({ ...f })),
    log: [],
    battles: [],
  };
}

export const initialHistory = (state: GameState): History => ({ past: [], present: state, future: [] });

const entry = (meta: Meta, e: Omit<LogEntry, "id" | "timestamp">): LogEntry => ({ id: meta.id, timestamp: meta.at, ...e });

function commit(h: History, next: GameState): History {
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
}

export function historyReducer(h: History, a: Action): History {
  const s = h.present;
  switch (a.type) {
    case "setHolder": {
      const current = s.territories[a.territory];
      if (!current || current.holder === a.holder || !s.factions.some((f) => f.id === a.holder)) return h;
      return commit(h, {
        ...s,
        territories: { ...s.territories, [a.territory]: { ...current, holder: a.holder } },
        log: [entry(a, { territory: a.territory, action: "holder-changed", from: current.holder, to: a.holder }), ...s.log],
      });
    }
    case "setNote": {
      const current = s.territories[a.territory];
      const note = a.note.trim();
      if (!current || (current.note ?? "") === note) return h;
      const { note: _old, ...rest } = current;
      return commit(h, { ...s, territories: { ...s.territories, [a.territory]: note ? { ...rest, note } : rest } });
    }
    case "loadScenario": {
      if (!SCENARIOS[a.scenarioId]) return h;
      const fresh = initialState(a.scenarioId);
      // The log and battle history are kept, never wiped silently.
      return commit(h, { ...fresh, log: [entry(a, { action: "scenario-loaded", note: SCENARIOS[a.scenarioId].name }), ...s.log], battles: s.battles });
    }
    case "undo": {
      const prev = h.past[h.past.length - 1];
      if (!prev) return h;
      return {
        past: h.past.slice(0, -1),
        present: { ...prev, log: [entry(a, { action: "undo" }), ...s.log], battles: s.battles },
        future: [s, ...h.future],
      };
    }
    case "redo": {
      const next = h.future[0];
      if (!next) return h;
      return {
        past: [...h.past, s].slice(-MAX_HISTORY),
        present: { ...next, log: [entry(a, { action: "redo" }), ...s.log], battles: s.battles },
        future: h.future.slice(1),
      };
    }
  }
}

const isFaction = (f: unknown): f is Faction =>
  !!f && typeof f === "object" && typeof (f as Faction).id === "string" && typeof (f as Faction).name === "string" && /^#[0-9a-fA-F]{6}$/.test((f as Faction).color);

/**
 * Turn saved or imported data into a valid state for the current map. Unknown version -> null.
 * Territories that no longer exist are dropped; new ones take the scenario's holder.
 */
export function normalizeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GameState>;
  if (r.version !== 1 || !r.territories || typeof r.territories !== "object") return null;
  const base = initialState(typeof r.scenarioId === "string" ? r.scenarioId : DEFAULT_SCENARIO_ID);
  const factions = Array.isArray(r.factions) && r.factions.length && r.factions.every(isFaction) ? (r.factions as Faction[]) : base.factions;
  const ids = new Set(factions.map((f) => f.id));
  const territories = { ...base.territories };
  for (const t of TERRITORIES) {
    const saved = (r.territories as GameState["territories"])[t.id];
    if (saved && typeof saved.holder === "string" && ids.has(saved.holder)) {
      territories[t.id] = typeof saved.note === "string" && saved.note ? { holder: saved.holder, note: saved.note } : { holder: saved.holder };
    } else if (!ids.has(territories[t.id].holder)) {
      territories[t.id] = { holder: "neutral" };
    }
  }
  return {
    version: 1,
    scenarioId: base.scenarioId,
    territories,
    factions,
    log: Array.isArray(r.log) ? (r.log.filter((e) => e && typeof e.id === "string" && typeof e.action === "string") as LogEntry[]) : [],
    battles: Array.isArray(r.battles) ? r.battles : [],
  };
}
