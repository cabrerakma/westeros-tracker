// Generates src/data/territories.geo.json and re-derives adjacency in territories.json.
// Run: npm run generate
//
// Method (spec section 3, "regions first"):
//   1. Hand-defined region polygons below (shared border polylines, so regions tile the landmass).
//   2. Every edge is roughened with deterministic midpoint displacement (shared edges match exactly).
//   3. Inside each region, the castle seeds are Voronoi sites; each cell is clipped to its region.
//   4. The Wall is a thin strip (one territory); islands are separate blob shapes.
//   5. Land adjacency is derived from shared boundary; sea links and overrides are listed below.
//
// territories.geo.json may be hand-edited afterwards. Re-running this script overwrites it.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Delaunay } from "d3-delaunay";
import polygonClipping from "polygon-clipping";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const territoriesPath = join(root, "src/data/territories.json");
const territories = JSON.parse(readFileSync(territoriesPath, "utf8"));

// ---------------------------------------------------------------- hand-made geography
// Named polylines. A polygon is built by chaining them (see REGIONS). Coordinates: 1000 x 2000.
const L = {
  BTW_COAST: [[225, 300], [205, 230], [200, 150], [250, 90], [380, 55], [520, 50], [660, 65], [790, 100], [860, 150], [880, 225], [850, 300]],
  B1: [[225, 300], [850, 300]], // Beyond the Wall / The Wall
  WALL_E: [[850, 300], [852, 345]],
  B2E: [[852, 345], [350, 347]], // The Wall / The North
  WALL_W: [[350, 347], [232, 345], [225, 300]],
  N_EAST: [[852, 345], [842, 420], [832, 500], [852, 600], [862, 700], [832, 780], [772, 830], [690, 850]],
  B4: [[690, 850], [650, 870]], // North / Vale (the Neck's east shoulder)
  B3: [[650, 870], [400, 870]], // North / Riverlands
  N_WEST: [[400, 870], [400, 830], [300, 790], [258, 700], [262, 610], [300, 545], [385, 490], [400, 420], [350, 347]],
  B5: [[650, 870], [645, 950], [640, 1040], [635, 1118]], // Vale / Riverlands
  V_COAST: [[690, 850], [740, 880], [800, 890], [880, 890], [925, 940], [915, 990], [880, 1020], [865, 1075], [830, 1100], [760, 1118], [700, 1122], [635, 1118]],
  RIVCROWN: [[635, 1118], [570, 1142], [545, 1165], [540, 1215]],
  RIVREACH: [[540, 1215], [430, 1215]],
  RIVWEST: [[430, 1215], [420, 1165], [400, 1105], [350, 1075], [275, 1030]],
  R_COAST: [[275, 1030], [270, 1000], [285, 940], [340, 900], [400, 870]],
  W_COAST: [[275, 1030], [220, 1060], [150, 1090], [130, 1150], [125, 1200], [150, 1260], [190, 1315]],
  WREACH: [[190, 1315], [300, 1315], [400, 1260], [430, 1215]],
  CROWN_COAST: [[635, 1118], [690, 1150], [760, 1160], [772, 1180], [738, 1235], [725, 1290]],
  CROWNSTORM: [[725, 1290], [630, 1295], [550, 1280]],
  REACHCROWN: [[550, 1280], [540, 1215]],
  REACHSTORM: [[550, 1280], [580, 1380], [560, 1480], [540, 1580], [560, 1700]],
  REACHDORNE: [[560, 1700], [450, 1705], [330, 1700]],
  R_WCOAST: [[330, 1700], [250, 1665], [180, 1620], [140, 1560], [125, 1480], [140, 1400], [190, 1315]],
  STORMDORNE: [[560, 1700], [700, 1690], [800, 1660]],
  S_COAST: [[725, 1290], [790, 1330], [830, 1390], [840, 1450], [800, 1520], [790, 1600], [800, 1660]],
  D_COAST: [[800, 1660], [860, 1700], [930, 1760], [940, 1820], [880, 1870], [780, 1900], [650, 1910], [520, 1900], [400, 1900], [330, 1860], [310, 1780], [330, 1700]],
};

// [polyline name, reversed?]
const REGIONS = {
  "beyond-the-wall": [["BTW_COAST"], ["B1", 1]],
  "the-wall": [["B1"], ["WALL_E"], ["B2E"], ["WALL_W"]],
  "the-north": [["N_EAST"], ["B4"], ["B3"], ["N_WEST"], ["B2E", 1]],
  "the-vale": [["V_COAST"], ["B5", 1], ["B4", 1]],
  "the-riverlands": [["B3", 1], ["B5"], ["RIVCROWN"], ["RIVREACH"], ["RIVWEST"], ["R_COAST"]],
  "the-westerlands": [["RIVWEST", 0], ["W_COAST"], ["WREACH"]],
  "the-crownlands": [["CROWN_COAST"], ["CROWNSTORM"], ["REACHCROWN"], ["RIVCROWN", 1]],
  "the-reach": [["WREACH"], ["RIVREACH", 1], ["REACHCROWN", 1], ["REACHSTORM"], ["REACHDORNE"], ["R_WCOAST"]],
  "the-stormlands": [["REACHSTORM"], ["STORMDORNE"], ["S_COAST", 1], ["CROWNSTORM"]],
  dorne: [["REACHDORNE", 1], ["STORMDORNE"], ["D_COAST"]],
};
// Note: the-westerlands lists RIVWEST forward ((430,1215) -> (275,1030)) then W_COAST then WREACH.

// Islands: id -> [rx, ry]. Each is its own territory, drawn as a deterministic blob around its seat.
const ISLANDS = {
  "bear-island": [34, 42],
  pyke: [34, 28],
  harlaw: [26, 26],
  dragonstone: [22, 20],
  tarth: [28, 24],
  "the-arbor": [30, 34],
};
// The island belongs to the region of its territory (from territories.json); the region polygon
// path also includes the island so region borders and captions can treat it as part of the region.
const ISLAND_REGIONS = {}; // filled from territories.json

// Sea links (islands to nearest mainland) plus the hand-set overrides to derived land adjacency.
const SEA_LINKS = [
  ["bear-island", "deepwood-motte"],
  ["pyke", "seagard"],
  ["pyke", "harlaw"],
  ["harlaw", "the-crag"],
  ["dragonstone", "kings-landing"],
  ["tarth", "storms-end"],
  ["the-arbor", "oldtown"],
];
const FORCE_ADJACENT = []; // extra [a, b] pairs to always include
const FORCE_NOT_ADJACENT = [["eyrie", "white-harbor"]]; // only touch at a tiny corner of the Neck // [a, b] pairs to always remove from derived land adjacency
const MIN_SHARED_EDGE = 15; // map units of shared boundary needed to count as land-adjacent

// ---------------------------------------------------------------- geometry helpers
const snap = (v) => Math.round(v * 100) / 100;
const pt = ([x, y]) => [snap(x), snap(y)];
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand01(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const MIN_LEN = 20; // stop subdividing below this length
const MAX_DISP = 6; // cap on displacement, so thin shapes (the Wall) stay thin

/** Interior points (exclusive of ends) from a to b, displaced deterministically. Orientation-independent. */
function rough(a, b, depth = 0) {
  if (cmp(a, b) > 0) return rough(b, a, depth).reverse();
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < MIN_LEN || depth > 6) return [];
  const key = `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  const r = rand01(hash(key)) * 2 - 1;
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const d = r * Math.min(0.16 * len, MAX_DISP);
  const mid = pt([(a[0] + b[0]) / 2 + nx * d, (a[1] + b[1]) / 2 + ny * d]);
  return [...rough(a, mid, depth + 1), mid, ...rough(mid, b, depth + 1)];
}

/** Roughen a closed ring (array of points, not repeating the first). */
function roughRing(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a, ...rough(a, b));
  }
  return out;
}

function chain(spec) {
  const pts = [];
  for (const [name, rev] of spec) {
    let seg = L[name].map(pt);
    if (rev) seg = [...seg].reverse();
    pts.push(...(pts.length ? seg.slice(1) : seg));
  }
  const first = pts[0], last = pts[pts.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts;
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function blob(cx, cy, rx, ry, id) {
  const n = 16;
  const base = hash(id);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const k = 0.78 + 0.34 * rand01(base + i * 7919);
    ring.push(pt([cx + Math.cos(ang) * rx * k, cy + Math.sin(ang) * ry * k]));
  }
  return ring;
}

const ringToPath = (ring) => "M" + ring.map(([x, y]) => `${snap(x)} ${snap(y)}`).join("L") + "Z";
const multiToPath = (mp) => mp.map((poly) => poly.map((ring) => ringToPath(ring.slice(0, -1))).join("")).join("");

// ---------------------------------------------------------------- build
const byId = Object.fromEntries(territories.map((t) => [t.id, t]));
for (const id of Object.keys(ISLANDS)) ISLAND_REGIONS[id] = byId[id].region;

const regionRings = {};
for (const [rid, spec] of Object.entries(REGIONS)) regionRings[rid] = roughRing(chain(spec));
// Iron Islands region has no mainland polygon.

const paths = {}; // territory id -> list of rings (each ring is an array of points, closed or not)
const rings = {}; // territory id -> MultiPolygon-ish [[ring,...]]
const problems = [];

for (const [rid, ring] of Object.entries(regionRings)) {
  const seeds = territories.filter((t) => t.region === rid && !(t.id in ISLANDS));
  for (const s of seeds) {
    if (!pointInRing(s.seat, ring)) problems.push(`seed ${s.id} (${s.seat}) is outside region polygon ${rid}`);
  }
  if (seeds.length === 1) {
    rings[seeds[0].id] = [[[...ring, ring[0]]]];
    continue;
  }
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const bounds = [Math.min(...xs) - 5, Math.min(...ys) - 5, Math.max(...xs) + 5, Math.max(...ys) + 5];
  const vor = new Delaunay(Float64Array.from(seeds.flatMap((s) => s.seat))).voronoi(bounds);
  seeds.forEach((s, i) => {
    const cell = vor.cellPolygon(i);
    const result = polygonClipping.intersection([[...ring, ring[0]]], [cell.map((p) => [p[0], p[1]])]);
    if (!result.length) {
      problems.push(`territory ${s.id} has an empty cell`);
      return;
    }
    // Snap, then roughen the long Voronoi edges (shared edges match exactly via the canonical key).
    rings[s.id] = result.map((poly) =>
      poly.map((r) => {
        const open = r.slice(0, -1).map(pt);
        return [...roughRing(open), roughRing(open)[0]];
      }),
    );
  });
}

// Islands.
for (const [id, [rx, ry]] of Object.entries(ISLANDS)) {
  const t = byId[id];
  const ring = blob(t.seat[0], t.seat[1], rx, ry, id);
  rings[id] = [[[...ring, ring[0]]]];
}

// Sanity: no island overlaps any land territory.
for (const id of Object.keys(ISLANDS)) {
  for (const [rid, ring] of Object.entries(regionRings)) {
    for (const p of rings[id][0][0]) if (pointInRing(p, ring)) problems.push(`island ${id} overlaps mainland region ${rid}`);
  }
}

// ---------------------------------------------------------------- adjacency from shared boundary
function edgesOf(mp) {
  const edges = [];
  for (const poly of mp) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) edges.push([ring[i], ring[i + 1]]);
  return edges;
}
function overlapLength([a1, a2], [b1, b2]) {
  const dx = a2[0] - a1[0], dy = a2[1] - a1[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  const ux = dx / len, uy = dy / len;
  const dist = (p) => Math.abs((p[0] - a1[0]) * uy - (p[1] - a1[1]) * ux);
  if (dist(b1) > 0.6 || dist(b2) > 0.6) return 0;
  const proj = (p) => (p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy;
  const lo = Math.max(0, Math.min(proj(b1), proj(b2)));
  const hi = Math.min(len, Math.max(proj(b1), proj(b2)));
  return Math.max(0, hi - lo);
}
const edgeCache = Object.fromEntries(Object.entries(rings).map(([id, mp]) => [id, edgesOf(mp)]));
const ids = territories.map((t) => t.id);
const adj = Object.fromEntries(ids.map((id) => [id, new Set()]));
const shared = {};
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    let total = 0;
    for (const ea of edgeCache[ids[i]]) for (const eb of edgeCache[ids[j]]) total += overlapLength(ea, eb);
    if (total >= MIN_SHARED_EDGE) {
      adj[ids[i]].add(ids[j]);
      adj[ids[j]].add(ids[i]);
      shared[`${ids[i]} ~ ${ids[j]}`] = Math.round(total);
    }
  }
}
for (const [a, b] of SEA_LINKS) { adj[a].add(b); adj[b].add(a); }
for (const [a, b] of FORCE_ADJACENT) { adj[a].add(b); adj[b].add(a); }
for (const [a, b] of FORCE_NOT_ADJACENT) { adj[a].delete(b); adj[b].delete(a); }

// Report differences against the previous (hand-written) adjacency, then overwrite.
const added = [], removed = [];
for (const t of territories) {
  for (const n of adj[t.id]) if (!t.adjacent.includes(n) && t.id < n) added.push(`${t.id} ~ ${n}`);
  for (const n of t.adjacent) if (!adj[t.id].has(n) && t.id < n) removed.push(`${t.id} ~ ${n}`);
}

// ---------------------------------------------------------------- write outputs
const geo = {
  _comment:
    "Generated by scripts/generate-territories.mjs; safe to hand-edit (re-running overwrites). SVG path data in a 1000x2000 map space. _regions = region outlines (mainland + islands), _seaLinks = dashed island links.",
};
for (const t of territories) geo[t.id] = multiToPath(rings[t.id]);

const regionPaths = {};
for (const [rid, ring] of Object.entries(regionRings)) regionPaths[rid] = ringToPath(ring);
for (const [id, rid] of Object.entries(ISLAND_REGIONS)) regionPaths[rid] = (regionPaths[rid] ?? "") + ringToPath(rings[id][0][0].slice(0, -1));
geo._regions = regionPaths;
geo._seaLinks = SEA_LINKS;
writeFileSync(join(root, "src/data/territories.geo.json"), JSON.stringify(geo, null, 1) + "\n");

for (const t of territories) t.adjacent = [...adj[t.id]].sort();
writeFileSync(territoriesPath, JSON.stringify(territories, null, 2) + "\n");

console.log(`Wrote territories.geo.json (${Object.keys(rings).length} territories).`);
console.log(`Adjacency: +${added.length} derived that the hand-written list lacked, -${removed.length} hand-written edges not found geometrically.`);
if (added.length) console.log("  added:  " + added.join(", "));
if (removed.length) console.log("  removed: " + removed.join(", "));
if (problems.length) {
  console.error("PROBLEMS:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
