import { describe, expect, it } from "vitest";
import { battlesFor, fromDateInput, knownPlayers, parsePlayers, territoryStats, toDateInput } from "./battles";
import type { Battle } from "../types";

const b = (id: string, territory: string, ts: string, outcome: Battle["outcome"], before = "stark", after = before): Battle => ({
  id, territory, timestamp: ts, outcome, holderBefore: before, holderAfter: after,
  attacker: { faction: "lannister", players: ["Sam"] }, defender: { faction: before, players: ["Alex", "Sam"] },
});

describe("battle stats", () => {
  const list = [
    b("1", "winterfell", "2026-11-01T12:00:00Z", "captured", "stark", "lannister"),
    b("2", "winterfell", "2026-11-03T12:00:00Z", "repelled", "lannister"),
    b("3", "winterfell", "2026-11-02T12:00:00Z", "captured", "lannister", "stark"),
    b("4", "pyke", "2026-11-04T12:00:00Z", "draw", "greyjoy"),
  ];
  it("counts fought and changed-hands per territory", () => {
    expect(territoryStats(list, "winterfell")).toEqual({ fought: 3, changedHands: 2 });
    expect(territoryStats(list, "pyke")).toEqual({ fought: 1, changedHands: 0 });
    expect(territoryStats(list, "riverrun")).toEqual({ fought: 0, changedHands: 0 });
  });
  it("lists a territory's battles newest first", () => {
    expect(battlesFor(list, "winterfell").map((x) => x.id)).toEqual(["2", "3", "1"]);
  });
  it("collects each player name once, sorted", () => {
    expect(knownPlayers(list)).toEqual(["Alex", "Sam"]);
  });
});

describe("helpers", () => {
  it("parses comma separated players", () => {
    expect(parsePlayers(" Sam, Alex ,, ")).toEqual(["Sam", "Alex"]);
    expect(parsePlayers("")).toEqual([]);
  });
  it("round-trips a date without shifting the day", () => {
    expect(toDateInput(fromDateInput("2026-11-24"))).toBe("2026-11-24");
    expect(toDateInput(fromDateInput("2026-01-01"))).toBe("2026-01-01");
  });
});
