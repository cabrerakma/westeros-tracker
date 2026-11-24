import { describe, expect, it } from "vitest";
import { historyReducer, initialHistory, initialState, normalizeState, type Action, type History } from "./game";

let n = 0;
const meta = () => ({ id: `id${++n}`, at: "2026-11-24T12:00:00.000Z" });
const run = (h: History, ...actions: Action[]) => actions.reduce(historyReducer, h);
const setHolder = (territory: string, holder: string): Action => ({ type: "setHolder", territory, holder, ...meta() });
const fresh = () => initialHistory(initialState("war-of-five-kings"));

describe("setHolder", () => {
  it("changes the holder and logs it", () => {
    const h = run(fresh(), setHolder("casterly-rock", "stark"));
    expect(h.present.territories["casterly-rock"].holder).toBe("stark");
    expect(h.present.log[0]).toMatchObject({ territory: "casterly-rock", action: "holder-changed", from: "lannister", to: "stark" });
  });
  it("ignores a no-op, an unknown territory and an unknown faction", () => {
    const h = fresh();
    expect(run(h, setHolder("casterly-rock", "lannister"))).toBe(h);
    expect(run(h, setHolder("nowhere", "stark"))).toBe(h);
    expect(run(h, setHolder("casterly-rock", "nobody"))).toBe(h);
  });
  it("does not mutate the previous state", () => {
    const h = fresh();
    run(h, setHolder("casterly-rock", "stark"));
    expect(h.present.territories["casterly-rock"].holder).toBe("lannister");
  });
});

describe("undo and redo", () => {
  it("undo restores the holder and appends to the log (never rewrites it)", () => {
    const h = run(fresh(), setHolder("casterly-rock", "stark"), { type: "undo", ...meta() });
    expect(h.present.territories["casterly-rock"].holder).toBe("lannister");
    expect(h.present.log.map((e) => e.action)).toEqual(["undo", "holder-changed"]);
  });
  it("redo re-applies it", () => {
    const h = run(fresh(), setHolder("casterly-rock", "stark"), { type: "undo", ...meta() }, { type: "redo", ...meta() });
    expect(h.present.territories["casterly-rock"].holder).toBe("stark");
    expect(h.present.log.map((e) => e.action)).toEqual(["redo", "undo", "holder-changed"]);
  });
  it("a new change clears redo", () => {
    const h = run(fresh(), setHolder("casterly-rock", "stark"), { type: "undo", ...meta() }, setHolder("pyke", "stark"));
    expect(h.future).toHaveLength(0);
  });
  it("undo with nothing to undo is a no-op", () => {
    const h = fresh();
    expect(run(h, { type: "undo", ...meta() })).toBe(h);
  });
});

describe("notes", () => {
  it("sets and clears a note", () => {
    let h = run(fresh(), { type: "setNote", territory: "winterfell", note: "  Besieged by Roose  ", ...meta() });
    expect(h.present.territories["winterfell"].note).toBe("Besieged by Roose");
    h = run(h, { type: "setNote", territory: "winterfell", note: "", ...meta() });
    expect(h.present.territories["winterfell"].note).toBeUndefined();
  });
});

describe("loadScenario (reset)", () => {
  it("resets holders, keeps the log, and can be undone", () => {
    let h = run(fresh(), setHolder("casterly-rock", "stark"), { type: "loadScenario", scenarioId: "blank", ...meta() });
    expect(h.present.territories["casterly-rock"].holder).toBe("neutral");
    expect(h.present.log[0].action).toBe("scenario-loaded");
    expect(h.present.log.some((e) => e.action === "holder-changed")).toBe(true);
    h = run(h, { type: "undo", ...meta() });
    expect(h.present.territories["casterly-rock"].holder).toBe("stark");
  });
  it("ignores an unknown scenario", () => {
    const h = fresh();
    expect(run(h, { type: "loadScenario", scenarioId: "nope", ...meta() })).toBe(h);
  });
});

describe("normalizeState", () => {
  it("accepts a valid state", () => {
    const s = initialState();
    expect(normalizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("rejects garbage and unknown versions", () => {
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState("x")).toBeNull();
    expect(normalizeState({ version: 2, territories: {} })).toBeNull();
  });
  it("drops unknown territories and fixes unknown holders", () => {
    const s = initialState();
    const raw = JSON.parse(JSON.stringify(s));
    raw.territories["eyrie"] = { holder: "stark" }; // no longer on the map
    raw.territories["pyke"] = { holder: "ghost-faction" };
    const out = normalizeState(raw)!;
    expect("eyrie" in out.territories).toBe(false);
    expect(out.territories["pyke"].holder).toBe("greyjoy");
  });
});

describe("battles", () => {
  const side = (faction: string, players: string[] = []) => ({ faction, players });
  const add = (over: Partial<Extract<Action, { type: "addBattle" }>> = {}): Action => ({
    type: "addBattle",
    battleId: `b${++n}`,
    territory: "winterfell",
    date: "2026-11-20T12:00:00.000Z",
    attacker: side("lannister", ["Sam"]),
    defender: side("stark", ["Alex"]),
    outcome: "captured",
    applyHolder: true,
    ...meta(),
    ...over,
  } as Action);

  it("a capture records the battle and gives the territory to the attacker", () => {
    const h = run(fresh(), add());
    expect(h.present.battles).toHaveLength(1);
    expect(h.present.battles[0]).toMatchObject({ territory: "winterfell", holderBefore: "stark", holderAfter: "lannister", outcome: "captured" });
    expect(h.present.territories["winterfell"].holder).toBe("lannister");
    expect(h.present.log[0].action).toBe("battle-recorded");
  });
  it("a capture without 'apply holder' leaves the holder alone", () => {
    const h = run(fresh(), add({ applyHolder: false }));
    expect(h.present.territories["winterfell"].holder).toBe("stark");
    expect(h.present.battles[0].holderAfter).toBe("stark");
  });
  it("repelled and draw never change the holder", () => {
    const h = run(fresh(), add({ outcome: "repelled" }), add({ outcome: "draw" }));
    expect(h.present.territories["winterfell"].holder).toBe("stark");
    expect(h.present.battles).toHaveLength(2);
  });
  it("rejects a battle with no attacker or the same faction on both sides", () => {
    const h = fresh();
    expect(run(h, add({ attacker: side("") }))).toBe(h);
    expect(run(h, add({ attacker: side("stark") }))).toBe(h);
    expect(run(h, add({ territory: "nowhere" }))).toBe(h);
  });
  it("undo removes the battle and restores the holder", () => {
    const h = run(fresh(), add(), { type: "undo", ...meta() });
    expect(h.present.battles).toHaveLength(0);
    expect(h.present.territories["winterfell"].holder).toBe("stark");
  });
  it("editing changes only the history (not the holder) and recomputes the result", () => {
    let h = run(fresh(), add());
    const id = h.present.battles[0].id;
    h = run(h, { type: "editBattle", battleId: id, changes: { outcome: "repelled", note: "Roose held on" }, ...meta() });
    expect(h.present.battles[0]).toMatchObject({ outcome: "repelled", holderAfter: "stark", note: "Roose held on" });
    expect(h.present.territories["winterfell"].holder).toBe("lannister"); // unchanged: the app prompts instead
    expect(h.present.log[0].action).toBe("battle-edited");
  });
  it("deleting removes only the battle", () => {
    let h = run(fresh(), add());
    h = run(h, { type: "deleteBattle", battleId: h.present.battles[0].id, ...meta() });
    expect(h.present.battles).toHaveLength(0);
    expect(h.present.territories["winterfell"].holder).toBe("lannister");
    expect(h.present.log[0].action).toBe("battle-deleted");
  });
  it("deleting can be undone", () => {
    let h = run(fresh(), add());
    h = run(h, { type: "deleteBattle", battleId: h.present.battles[0].id, ...meta() }, { type: "undo", ...meta() });
    expect(h.present.battles).toHaveLength(1);
  });
  it("a reset keeps the battles", () => {
    const h = run(fresh(), add(), { type: "loadScenario", scenarioId: "blank", ...meta() });
    expect(h.present.battles).toHaveLength(1);
  });
  it("saved battles are validated on load", () => {
    const s = run(fresh(), add()).present;
    const raw = JSON.parse(JSON.stringify(s));
    raw.battles.push({ id: "junk" }, { ...raw.battles[0], id: "x", territory: "eyrie" });
    expect(normalizeState(raw)!.battles).toHaveLength(1);
  });
});
