// One-off: trims the "Game of Thrones shapefiles" down to the parts this app uses and writes
// scripts/source/westeros-source.json (committed, so nobody needs the original download).
//
// Usage: node scripts/extract-source-map.mjs <dir with the .shp/.dbf files>
//
// Data credit and license (must be kept with the derived data):
//   Map of Westeros by Tear (Cartographers' Guild), extended by theMountainGoat (2012);
//   GIS shapefiles by cadaei, revised by Patrick Triest (2017). A Song of Ice and Fire
//   is copyright George R. R. Martin. Licensed CC BY-NC-SA 3.0 (non-commercial, share-alike).
import * as shapefile from "shapefile";
import polygonClipping from "polygon-clipping";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/extract-source-map.mjs <shapefile dir>");
const outDir = join(dirname(fileURLToPath(import.meta.url)), "source");

async function load(layer) {
  const src = await shapefile.open(join(dir, layer + ".shp"), join(dir, layer + ".dbf"), { encoding: "utf-8" });
  const out = [];
  for (let r = await src.read(); !r.done; r = await src.read()) out.push(r.value);
  return out;
}
const r2 = (n) => Math.round(n * 100) / 100;
const roundCoords = (c) => (typeof c[0] === "number" ? [r2(c[0]), r2(c[1])] : c.map(roundCoords));
const asMulti = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

const political = {};
for (const f of await load("Political")) {
  const name = f.properties.name ?? f.properties.claimedby; // the Wildlings polygon has no name
  political[name] = roundCoords(asMulti(f.geometry));
}

// Essos: only the west-coast strip that holds Pentos and Braavos.
const essos = (await load("Continents")).find((f) => f.properties.name === "Essos");
const box = [[[27, -12.5], [37.5, -12.5], [37.5, 18], [27, 18], [27, -12.5]]];
const essosStrip = polygonClipping.intersection(essos.geometry.coordinates, box);

const westeros = (f) => f.properties.continent === "Westeros";
const islands = (await load("Islands")).filter(westeros).map((f) => ({ name: f.properties.name, poly: roundCoords(asMulti(f.geometry)) }));
const lakes = (await load("Lakes")).filter(westeros).map((f) => ({ name: f.properties.name, poly: roundCoords(asMulti(f.geometry)) }));
const rivers = (await load("Rivers")).filter(westeros).map((f) => ({ name: f.properties.name, size: f.properties.size, lines: roundCoords(f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates) }));
const roads = (await load("Roads")).filter(westeros).map((f) => ({ name: f.properties.name, size: f.properties.size, line: roundCoords(f.geometry.coordinates) }));
const mountains = (await load("Landscape")).filter((f) => westeros(f) && f.properties.type === "mountain").map((f) => ({ name: f.properties.name, poly: roundCoords(asMulti(f.geometry)) }));
const wall = roundCoords((await load("Wall"))[0].geometry.coordinates);

const locations = {};
for (const f of await load("Locations")) {
  if (!f.geometry || !f.properties.name) continue;
  const [x, y] = f.geometry.coordinates;
  if (x > 40 || y < -12.5 || y > 45) continue;
  locations[f.properties.name] = [r2(x), r2(y)]; // duplicate names keep the last; none matter for our seats
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "westeros-source.json"),
  JSON.stringify({
    _credit:
      "Derived from the Game of Thrones shapefiles: map by Tear and theMountainGoat, GIS data by cadaei, revised by Patrick Triest. A Song of Ice and Fire is (c) George R. R. Martin. License: CC BY-NC-SA 3.0. Coordinates are map units (x = east, y = north), trimmed and rounded to 0.01.",
    political,
    essosStrip: roundCoords(essosStrip),
    islands,
    lakes,
    rivers,
    roads,
    mountains,
    wall,
    locations,
  }),
);
console.log("regions:", Object.keys(political).join(" | "));
console.log(`islands ${islands.length}, lakes ${lakes.length}, rivers ${rivers.length}, roads ${roads.length}, mountains ${mountains.length}, locations ${Object.keys(locations).length}`);
