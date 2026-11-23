import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without types
import { loadData, validateData } from "./validate-data.mjs";

const find = (d: any, id: string) => d.territories.find((t: any) => t.id === id);

describe("data files", () => {
  it("pass validation", () => {
    expect(validateData(loadData())).toEqual([]);
  });

  it("has the expected counts from the spec", () => {
    const d = loadData();
    expect(d.factions).toHaveLength(13);
    expect(d.regions).toHaveLength(11);
    expect(d.territories).toHaveLength(44);
    const perRegion: Record<string, number> = {};
    for (const t of d.territories) perRegion[t.region] = (perRegion[t.region] ?? 0) + 1;
    expect(perRegion).toEqual({
      "beyond-the-wall": 3, "the-wall": 1, "the-north": 8, "the-riverlands": 5, "the-vale": 4,
      "the-westerlands": 4, "the-iron-islands": 2, "the-crownlands": 3, "the-reach": 6,
      "the-stormlands": 4, dorne: 4,
    });
  });

  it("matches the home-faction decisions", () => {
    const d = loadData();
    expect(find(d, "dreadfort").homeFaction).toBe("bolton");
    expect(find(d, "riverrun").homeFaction).toBe("stark");
    expect(find(d, "eyrie").homeFaction).toBe("neutral");
  });
});

describe("validator catches problems", () => {
  const fresh = () => structuredClone(loadData());

  it("asymmetric adjacency", () => {
    const d = fresh();
    find(d, "winterfell").adjacent.push("sunspear");
    expect(validateData(d).join("\n")).toMatch(/not symmetric/);
  });

  it("unknown adjacent id", () => {
    const d = fresh();
    d.territories[0].adjacent.push("nowhere");
    expect(validateData(d).join("\n")).toMatch(/does not exist/);
  });

  it("disconnected graph", () => {
    const d = fresh();
    for (const t of d.territories) t.adjacent = t.adjacent.filter((n: string) => n !== "castle-black");
    find(d, "castle-black").adjacent = [];
    expect(validateData(d).join("\n")).toMatch(/not connected/);
  });

  it("bad faction color, glyph and duplicate id", () => {
    const d = fresh();
    d.factions[0].color = "red";
    d.factions[1].glyph = "missing";
    d.factions[2].id = d.factions[3].id;
    const msg = validateData(d).join("\n");
    expect(msg).toMatch(/invalid hex color/);
    expect(msg).toMatch(/unknown glyph/);
    expect(msg).toMatch(/duplicate id/);
  });

  it("scenario missing a holder or with an unknown holder", () => {
    const d = fresh();
    delete d.scenarios[0].territories["winterfell"];
    d.scenarios[1].territories["pyke"].holder = "nobody";
    const msg = validateData(d).join("\n");
    expect(msg).toMatch(/no holder for "winterfell"/);
    expect(msg).toMatch(/holder "nobody"/);
  });

  it("empty region", () => {
    const d = fresh();
    d.regions.push({ id: "empty", name: "Empty", labelPos: [0, 0] });
    expect(validateData(d).join("\n")).toMatch(/has no territories/);
  });
});
