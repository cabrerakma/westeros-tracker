import { describe, expect, it } from "vitest";
import { controlState, regionSummary, shortFactionName } from "./status";
import { FACTIONS, REGIONS, SCENARIOS, TERRITORIES } from "../data";

describe("controlState", () => {
  it("controlled when holder is home", () => expect(controlState("lannister", "lannister")).toBe("controlled"));
  it("occupied when holder is not home", () => expect(controlState("lannister", "stark")).toBe("occupied"));
  it("Riverlands captured shows occupied (home is Stark)", () => expect(controlState("lannister", "stark")).toBe("occupied"));
  it("unclaimed wins over occupied", () => expect(controlState("neutral", "stark")).toBe("unclaimed"));
  it("the Vale at start is unclaimed, not controlled", () => expect(controlState("neutral", "neutral")).toBe("unclaimed"));
});

describe("regionSummary", () => {
  const holders = Object.fromEntries(Object.entries(SCENARIOS["war-of-five-kings"].territories).map(([k, v]) => [k, v.holder]));
  const region = (id: string) => REGIONS.find((r) => r.id === id)!;
  it("full control", () => expect(regionSummary(region("the-reach"), TERRITORIES, holders, FACTIONS)).toBe("Tyrell 6/6"));
  it("split region", () => expect(regionSummary(region("the-north"), TERRITORIES, holders, FACTIONS)).toBe("Stark 7, Bolton 1"));
  it("unclaimed region", () => expect(regionSummary(region("the-vale"), TERRITORIES, holders, FACTIONS)).toBe("Unclaimed 4/4"));
});

describe("shortFactionName", () => {
  it("shortens", () => {
    expect(shortFactionName({ name: "House Stark" })).toBe("Stark");
    expect(shortFactionName({ name: "Brotherhood without Banners" })).toBe("Brotherhood");
    expect(shortFactionName({ name: "Neutrals (Mercenaries)" })).toBe("Mercenaries");
  });
});
