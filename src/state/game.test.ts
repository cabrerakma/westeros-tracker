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
