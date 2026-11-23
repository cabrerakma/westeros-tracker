// Data validation for the Westeros tracker (spec section 7).
// CLI:  node scripts/validate-data.mjs        (exits 1 on any error)
// Test: import { validateData, loadData } from this file.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEX = /^#[0-9a-fA-F]{6}$/;
const TIERS = ["city", "fortress", "castle", "holdfast"];

const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

export function loadData() {
  const scenarioDir = join(root, "src/data/scenarios");
  const scenarios = readdirSync(scenarioDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, ...readJson(`src/data/scenarios/${f}`) }));
  const geoPath = join(root, "src/data/territories.geo.json");
  return {
    factions: readJson("src/data/factions.json"),
    regions: readJson("src/data/regions.json"),
    territories: readJson("src/data/territories.json"),
    glyphs: readJson("src/data/glyphs.json"),
    // territories.geo.json is generated in M1; it is optional until then.
    geo: existsSync(geoPath) ? readJson("src/data/territories.geo.json") : null,
    scenarios,
  };
}

/** Returns an array of human-readable error strings; empty means valid. */
export function validateData({ factions, regions, territories, glyphs, geo, scenarios }) {
  const errors = [];
  const err = (m) => errors.push(m);

  const glyphIds = new Set(Object.keys(glyphs).filter((k) => !k.startsWith("_")));
  glyphIds.add("none");

  // Factions: unique id, valid hex, existing glyph.
  const factionIds = new Set();
  for (const f of factions) {
    if (factionIds.has(f.id)) err(`faction: duplicate id "${f.id}"`);
    factionIds.add(f.id);
    if (!HEX.test(f.color ?? "")) err(`faction "${f.id}": invalid hex color "${f.color}"`);
    if (f.altColor !== undefined && !HEX.test(f.altColor)) err(`faction "${f.id}": invalid altColor "${f.altColor}"`);
    if (!glyphIds.has(f.glyph)) err(`faction "${f.id}": unknown glyph "${f.glyph}"`);
  }
  if (!factionIds.has("neutral")) err(`faction: the built-in "neutral" faction is missing`);

  // Regions.
  const regionIds = new Set();
  for (const r of regions) {
    if (regionIds.has(r.id)) err(`region: duplicate id "${r.id}"`);
    regionIds.add(r.id);
  }

  // Territories.
  const byId = new Map();
  for (const t of territories) {
    if (byId.has(t.id)) err(`territory: duplicate id "${t.id}"`);
    byId.set(t.id, t);
  }
  const regionCount = Object.fromEntries([...regionIds].map((r) => [r, 0]));
  for (const t of territories) {
    if (!regionIds.has(t.region)) err(`territory "${t.id}": unknown region "${t.region}"`);
    else regionCount[t.region]++;
    if (!factionIds.has(t.homeFaction)) err(`territory "${t.id}": unknown homeFaction "${t.homeFaction}"`);
    if (!TIERS.includes(t.tier)) err(`territory "${t.id}": invalid tier "${t.tier}"`);
    for (const n of t.adjacent) {
      if (n === t.id) err(`territory "${t.id}": adjacent to itself`);
      const other = byId.get(n);
      if (!other) err(`territory "${t.id}": adjacent id "${n}" does not exist`);
      else if (!other.adjacent.includes(t.id)) err(`adjacency not symmetric: "${t.id}" lists "${n}" but not vice versa`);
    }
  }
  for (const [r, n] of Object.entries(regionCount)) if (n === 0) err(`region "${r}" has no territories`);

  // Connected graph (BFS from the first territory).
  if (territories.length > 0) {
    const seen = new Set([territories[0].id]);
    const queue = [territories[0].id];
    while (queue.length) {
      const cur = byId.get(queue.shift());
      for (const n of cur?.adjacent ?? []) {
        if (byId.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    const missing = territories.filter((t) => !seen.has(t.id)).map((t) => t.id);
    if (missing.length) err(`adjacency graph is not connected; unreachable from "${territories[0].id}": ${missing.join(", ")}`);
  }

  // Geometry file (once generated in M1): every territory has a path and vice versa.
  if (geo) {
    for (const t of territories) if (!(t.id in geo)) err(`territories.geo.json: no path for "${t.id}"`);
    for (const id of Object.keys(geo)) if (!id.startsWith("_") && !byId.has(id)) err(`territories.geo.json: path for unknown territory "${id}"`);
  }

  // Scenarios.
  for (const s of scenarios) {
    const where = `scenario ${s.file ?? s.id}`;
    const scenarioFactions = new Set();
    for (const f of s.factions ?? []) {
      if (scenarioFactions.has(f.id)) err(`${where}: duplicate faction "${f.id}"`);
      scenarioFactions.add(f.id);
      if (!HEX.test(f.color ?? "")) err(`${where}: faction "${f.id}" has invalid color "${f.color}"`);
      if (!glyphIds.has(f.glyph)) err(`${where}: faction "${f.id}" has unknown glyph "${f.glyph}"`);
    }
    for (const t of territories) {
      const st = s.territories?.[t.id];
      if (!st) err(`${where}: no holder for "${t.id}"`);
      else if (!scenarioFactions.has(st.holder)) err(`${where}: holder "${st.holder}" of "${t.id}" is not a faction in the scenario`);
    }
    for (const id of Object.keys(s.territories ?? {})) if (!byId.has(id)) err(`${where}: unknown territory "${id}"`);
  }

  return errors;
}

// Run as a CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const data = loadData();
  const errors = validateData(data);
  if (errors.length) {
    console.error(`Data validation FAILED (${errors.length} problem${errors.length === 1 ? "" : "s"}):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(
    `Data OK: ${data.factions.length} factions, ${data.regions.length} regions, ${data.territories.length} territories, ${data.scenarios.length} scenarios.`,
  );
}
