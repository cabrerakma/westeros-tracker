import { DEFAULT_SCENARIO_ID, SCENARIOS, TERRITORIES } from "../data";
import type { Battle, Faction, FactionId, GameState, LogEntry, TerritoryId } from "../types";

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
  | ({ type: "addBattle"; battleId: string; territory: TerritoryId; date: string; attacker: Battle["attacker"]; defender: Battle["defender"]; outcome: Battle["outcome"]; note?: string; applyHolder: boolean } & Meta)
  | ({ type: "editBattle"; battleId: string; changes: Partial<Pick<Battle, "timestamp" | "attacker" | "defender" | "outcome" | "note">> } & Meta)
  | ({ type: "deleteBattle"; battleId: string } & Meta)
  | ({ type: "loadScenario"; scenarioId: string } & Meta)
  | ({ type: "importState"; state: GameState } & Meta)
  | { type: "replaceHistory"; state: GameState } // load a map as the starting point (no log entry, no undo)
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
  if (a.type === "replaceHistory") return initialHistory(a.state);
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
    case "addBattle": {
      const current = s.territories[a.territory];
      if (!current || !a.attacker.faction || a.attacker.faction === a.defender.faction) return h;
      const captures = a.outcome === "captured" && a.applyHolder;
      const holderAfter = captures ? a.attacker.faction : current.holder;
      const battle: Battle = {
        id: a.battleId,
        timestamp: a.date,
        territory: a.territory,
        attacker: a.attacker,
        defender: a.defender,
        outcome: a.outcome,
        holderBefore: current.holder,
        holderAfter,
        ...(a.note?.trim() ? { note: a.note.trim() } : {}),
      };
      return commit(h, {
        ...s,
        territories: captures ? { ...s.territories, [a.territory]: { ...current, holder: holderAfter } } : s.territories,
        battles: [...s.battles, battle],
        log: [entry(a, { territory: a.territory, action: "battle-recorded", from: a.attacker.faction, to: a.defender.faction, note: a.outcome }), ...s.log],
      });
    }
    case "editBattle": {
      const old = s.battles.find((b) => b.id === a.battleId);
      if (!old) return h;
      const next: Battle = { ...old, ...a.changes };
      next.holderAfter = next.outcome === "captured" ? next.attacker.faction : next.holderBefore;
      if (a.changes.note !== undefined) {
        const n = a.changes.note.trim();
        if (n) next.note = n;
        else delete next.note;
      }
      if (JSON.stringify(next) === JSON.stringify(old)) return h;
      return commit(h, {
        ...s,
        battles: s.battles.map((b) => (b.id === old.id ? next : b)),
        log: [entry(a, { territory: old.territory, action: "battle-edited", from: next.attacker.faction, to: next.defender.faction, note: next.outcome }), ...s.log],
      });
    }
    case "deleteBattle": {
      const old = s.battles.find((b) => b.id === a.battleId);
      if (!old) return h;
      return commit(h, {
        ...s,
        battles: s.battles.filter((b) => b.id !== old.id),
        log: [entry(a, { territory: old.territory, action: "battle-deleted", from: old.attacker.faction, to: old.defender.faction, note: old.outcome }), ...s.log],
      });
    }
    case "loadScenario": {
      if (!SCENARIOS[a.scenarioId]) return h;
      const fresh = initialState(a.scenarioId);
      // A reset starts fresh: holders, battles and the change log are cleared. The app downloads a backup
      // file first, and undo brings everything back.
      return commit(h, { ...fresh, log: [entry(a, { action: "scenario-loaded", note: SCENARIOS[a.scenarioId].name })] });
    }
    case "importState": {
      return commit(h, { ...a.state, log: [entry(a, { action: "imported" }), ...a.state.log] });
    }
    case "undo": {
      const prev = h.past[h.past.length - 1];
      if (!prev) return h;
      return {
        past: h.past.slice(0, -1),
        present: { ...prev, log: [entry(a, { action: "undo" }), ...s.log] },
        future: [s, ...h.future],
      };
    }
    case "redo": {
      const next = h.future[0];
      if (!next) return h;
      return {
        past: [...h.past, s].slice(-MAX_HISTORY),
        present: { ...next, log: [entry(a, { action: "redo" }), ...s.log] },
        future: h.future.slice(1),
      };
    }
  }
}

const isFaction = (f: unknown): f is Faction =>
  !!f && typeof f === "object" && typeof (f as Faction).id === "string" && typeof (f as Faction).name === "string" && /^#[0-9a-fA-F]{6}$/.test((f as Faction).color);

const OUTCOMES = ["captured", "repelled", "draw"];
const isSide = (x: unknown) => !!x && typeof x === "object" && typeof (x as Battle["attacker"]).faction === "string" && Array.isArray((x as Battle["attacker"]).players);
const isBattle = (b: unknown): b is Battle =>
  !!b && typeof b === "object" && typeof (b as Battle).id === "string" && typeof (b as Battle).territory === "string" && typeof (b as Battle).timestamp === "string" &&
  OUTCOMES.includes((b as Battle).outcome) && isSide((b as Battle).attacker) && isSide((b as Battle).defender) &&
  TERRITORIES.some((t) => t.id === (b as Battle).territory);

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
    battles: Array.isArray(r.battles) ? r.battles.filter(isBattle) : [],
  };
}
