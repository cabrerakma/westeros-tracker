// Builds the map geometry from the real-map source data (scripts/source/westeros-source.json).
// Run: npm run generate. Writes:
//   src/data/territories.geo.json  shapes (SVG paths), region outlines, roads, lakes, labels
//   src/data/territories.json      seats (real castle positions) and re-derived adjacency
//   src/data/regions.json          label positions and sizes
//
// Method:
//   1. The 11 political regions of the source map are projected into a 1000-wide map space.
//      The Gift is merged into The North; a thin strip along the Wall becomes its own region;
//      everything north of it is Beyond the Wall (cropped). A strip of Essos holds Pentos and Braavos.
//   2. Inside each region polygon, castle seats are Voronoi sites; each cell is clipped to the polygon.
//      Polygons (islands) with no seat go to the nearest seat in the region.
//   3. Land adjacency comes from shared boundaries; sea links are derived for isolated islands
//      and listed below for the crossings and special cases.
//
// Data credit: see scripts/source/westeros-source.json (CC BY-NC-SA 3.0, non-commercial).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Delaunay } from "d3-delaunay";
import polygonClipping from "polygon-clipping";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "scripts/source/westeros-source.json"), "utf8"));
const territoriesPath = join(root, "src/data/territories.json");
const regionsPath = join(root, "src/data/regions.json");
const territories = JSON.parse(readFileSync(territoriesPath, "utf8"));
const regionsFile = JSON.parse(readFileSync(regionsPath, "utf8"));

// ---------------------------------------------------------------- tunables
const LON0 = 0.9; // west edge of the map (source units)
const LON1 = 34.5; // east edge (inside the Essos strip)
const LAT_TOP = 43.5; // crop line north of the Wall
const LAT_BOTTOM = -12.5;
const PAD = 20; // map-space padding
const WALL_THICKNESS = 0.6; // source units
const WALL_EXTEND = [0.8, 3.2]; // extend the wall line at its east end / west end (the source line runs east to west)
const MIN_SHARED_EDGE = 20; // map units of shared boundary needed to count as land-adjacent
const EDGE_TOL = 1.2;

// Seat positions: a name in the source "Locations" layer, or a literal [lon, lat].
const SEAT_SOURCE = {
  "haunted-forest": "The Haunted Forest",
  frostfangs: [8.5, 40.5], // no source location: the mountains in the far north-west
  hardhome: [20.5, 38.5], // no source location: east coast beyond the Wall
  "castle-black": "Castle Black",
  "last-hearth": "Last Hearth",
  karhold: "Karhold",
  "bear-island": [10.52, 32.08],
  "deepwood-motte": "Deepwood Motte",
  winterfell: "Winterfell",
  dreadfort: "The Dreadfort",
  "white-harbor": "White Harbor",
  "moat-cailin": "Moat Cailin",
  "the-twins": "The Twins",
  seagard: "Seagard",
  riverrun: "Riverrun",
  harrenhal: "Harrenhal",
  "raventree-hall": "Raventree Hall",
  eyrie: "The Eyrie",
  gulltown: "Gulltown",
  runestone: "Runestone",
  "the-fingers": [24.9, 15.2],
  "casterly-rock": "Lannisport", // Casterly Rock is not in the source; Lannisport sits beside it
  "golden-tooth": "Golden Tooth",
  "the-crag": "The Crag",
  ashemark: "Ashemark",
  pyke: "Pyke",
  harlaw: "Ten Towers",
  "kings-landing": "King's Landing",
  dragonstone: "Dragonstone",
  duskendale: "Duskendale",
  highgarden: "Highgarden",
  goldengrove: "Goldengrove",
  "horn-hill": "Horn Hill",
  oldtown: "Oldtown",
  "the-arbor": [6.1, -10.4],
  "brightwater-keep": "Brightwater Keep",
  "storms-end": "Storm's End",
  bronzegate: "Bronzegate",
  nightsong: "Nightsong",
  tarth: "Evenfall Hall",
  yronwood: "Yronwood",
  sunspear: "Sunspear",
  starfall: "Starfall",
  hellholt: "Hellholt",
  pentos: "Pentos",
  braavos: "Braavos",
};

// Sea links always drawn (island to mainland, and the crossings of the Narrow Sea).
const SEA_LINKS_EXTRA = [
  ["bear-island", "deepwood-motte"],
  ["pyke", "harlaw"],
  ["dragonstone", "kings-landing"],
  ["tarth", "storms-end"],
  ["the-arbor", "oldtown"],
  ["pentos", "kings-landing"],
  ["braavos", "white-harbor"],
  ["pentos", "braavos"],
];
const SKIP_AUTO_SEA_LINK = ["pentos", "braavos"]; // linked explicitly above, not to the nearest Westeros territory
// Land drawn as unselectable scenery (not part of any territory): [lonMin, latMin, lonMax, latMax].
const SCENERY_BOXES = [[22.9, 32.8, 26.6, 37.2]]; // Skagos, Skane and the islets east of them
const FORCE_NOT_ADJACENT = []; // [a, b] pairs removed from derived land adjacency

// Region priority: earlier regions win overlaps. political = names in the source layer.
const REGION_DEFS = [
  { id: "the-wall" },
  { id: "beyond-the-wall", political: ["Wildlings"], minus: "wall" },
  { id: "the-north", political: ["The North", "The Gift"], minus: "wall" },
  { id: "the-riverlands", political: ["Riverlands"] },
  { id: "the-vale", political: ["The Vale"], scenery: true }, // drawn, but nobody can hold it
  { id: "the-westerlands", political: ["The Westerlands"] },
  { id: "the-crownlands", political: ["Crownsland"] },
  { id: "the-reach", political: ["The Reach"] },
  { id: "the-stormlands", political: ["Stormlands"] },
  { id: "dorne", political: ["Dorne"] },
  { id: "the-iron-islands", political: ["The Iron Islands"] },
  { id: "the-free-cities" },
];
const SCENERY_REGION_NAMES = { "the-vale": "Vale" };
const LABEL_OVERRIDES = { "the-iron-islands": { rotate: -90, size: 15, side: "west" }, "the-wall": { size: 11, along: 0.3 } };

// ---------------------------------------------------------------- geometry helpers
const S = (1000 - 2 * PAD) / (LON1 - LON0);
const H = Math.round(2 * PAD + (LAT_TOP - LAT_BOTTOM) * S);
const proj = ([lon, lat]) => [PAD + (lon - LON0) * S, PAD + (LAT_TOP - lat) * S];
const projRing = (r) => r.map(proj);
const projMulti = (mp) => mp.map((poly) => poly.map(projRing));
const r1 = (v) => Math.round(v * 10) / 10;

const multi = (x) => x; // clarity: a MultiPolygon is [[ring, ...holes], ...]
const union = (list) => (list.length ? polygonClipping.union(...list) : []);
const area = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a) / 2;
};
const polyArea = (poly) => area(poly[0]) - poly.slice(1).reduce((s, h) => s + area(h), 0);
const dropTiny = (mp, minArea = 2) => mp.filter((p) => polyArea(p) >= minArea);

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const pointInPoly = (p, poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((h) => pointInRing(p, h));
const pointInMulti = (p, mp) => mp.some((poly) => pointInPoly(p, poly));

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function distToRing(p, ring) {
  let d = Infinity;
  for (let i = 0; i < ring.length - 1; i++) d = Math.min(d, distToSegment(p, ring[i], ring[i + 1]));
  return d;
}

/** Pole of inaccessibility of a polygon (outer ring + holes), by grid search. */
function pole(poly, step = 6) {
  const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
  let best = { p: poly[0][0], d: -1 };
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      if (!pointInPoly([x, y], poly)) continue;
      const d = Math.min(...poly.map((r) => distToRing([x, y], r)));
      if (d > best.d) best = { p: [x, y], d };
    }
  }
  return best;
}

const ringPath = (ring) => "M" + ring.slice(0, -1).map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L") + "Z";
const multiPath = (mp) => mp.map((poly) => poly.map(ringPath).join("")).join("");
const linePath = (pts) => "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L");

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

// ---------------------------------------------------------------- regions
const problems = [];
const political = Object.fromEntries(Object.entries(src.political).map(([k, mp]) => [k, projMulti(mp)]));

// Crop: keep y >= PAD (north of that is dropped); also keep x within the map.
const CROP = [[[[-100, PAD], [1000 - PAD, PAD], [1000 - PAD, 5000], [-100, 5000], [-100, PAD]]]];
const crop = (mp) => polygonClipping.intersection(mp, ...CROP);

// Wall strip: extended polyline, thickened with one quad per segment.
function wallStrip() {
  const pts = src.wall.map((p) => [...p]);
  const dir = (a, b) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const dW = dir(pts[1], pts[0]);
  pts.unshift([pts[0][0] + dW[0] * WALL_EXTEND[0], pts[0][1] + dW[1] * WALL_EXTEND[0]]);
  const n = pts.length;
  const dE = dir(pts[n - 2], pts[n - 1]);
  pts.push([pts[n - 1][0] + dE[0] * WALL_EXTEND[1], pts[n - 1][1] + dE[1] * WALL_EXTEND[1]]);
  const quads = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const d = dir(a, b);
    const nx = -d[1] * (WALL_THICKNESS / 2), ny = d[0] * (WALL_THICKNESS / 2);
    const q = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]].map(proj);
    q.push(q[0]);
    quads.push([[q]]);
  }
  return { strip: union(quads), line: pts.map(proj) };
}
const { strip, line: wallLine } = wallStrip();

const rawRegions = {};
for (const def of REGION_DEFS) {
  let mp;
  if (def.id === "the-wall") {
    mp = polygonClipping.intersection(strip, union([political["Wildlings"], political["The Gift"], political["The North"]]));
  } else if (def.id === "the-free-cities") {
    mp = projMulti(src.essosStrip);
  } else {
    mp = union(def.political.map((n) => political[n]));
    if (def.minus === "wall") mp = polygonClipping.difference(mp, strip);
  }
  rawRegions[def.id] = crop(mp);
}
// Resolve overlaps by priority.
const regionPolys = {};
let taken = [];
for (const def of REGION_DEFS) {
  const mp = taken.length ? polygonClipping.difference(rawRegions[def.id], taken) : rawRegions[def.id];
  regionPolys[def.id] = dropTiny(mp);
  taken = union([taken, regionPolys[def.id]].filter((x) => x.length));
}

// ---------------------------------------------------------------- seats
const SNAP_MAX = 40; // a seat this close (map px) to its region is moved onto the land
function snapInside(p, mp) {
  let best = null;
  for (const poly of mp) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const q = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { q, d };
  }
  if (!best) return null;
  // look for the closest point inside the land around the nearest boundary point
  let found = null;
  for (const r of [3, 5, 8, 12, 18, 26]) {
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const cand = [best.q[0] + Math.cos(ang) * r, best.q[1] + Math.sin(ang) * r];
      if (!pointInMulti(cand, mp)) continue;
      const d = Math.hypot(cand[0] - p[0], cand[1] - p[1]);
      if (!found || d < found.dist) found = { p: cand, dist: d };
    }
    if (found) return found;
  }
  return { p: best.q, dist: best.d };
}
const byId = Object.fromEntries(territories.map((t) => [t.id, t]));
const seats = {};
for (const t of territories) {
  const s = SEAT_SOURCE[t.id];
  if (!s) {
    problems.push(`no seat source for ${t.id}`);
    continue;
  }
  const ll = typeof s === "string" ? src.locations[s] : s;
  if (!ll) {
    problems.push(`seat location "${s}" for ${t.id} not found in source`);
    continue;
  }
  seats[t.id] = proj(ll);
  if (!pointInMulti(seats[t.id], regionPolys[t.region])) {
    const snapped = snapInside(seats[t.id], regionPolys[t.region]);
    if (snapped && snapped.dist <= SNAP_MAX) {
      console.log(`  note: moved seat of ${t.id} ${snapped.dist.toFixed(1)} px onto land`);
      seats[t.id] = snapped.p;
    } else {
      problems.push(`seat of ${t.id} (${s}) is outside its region polygon ${t.region} (source ${JSON.stringify(ll)}); nearest land is ${snapped ? snapped.dist.toFixed(1) : "?"} px away`);
    }
  }
  t.seat = [r1(seats[t.id][0]), r1(seats[t.id][1])];
}

// ---------------------------------------------------------------- territory shapes
const shapes = {}; // id -> MultiPolygon
const sceneryPolys = []; // polygons drawn but owned by no territory
const isScenery = (poly) => {
  const [cx, cy] = centroidOf(poly);
  const lon = LON0 + (cx - PAD) / S, lat = LAT_TOP - (cy - PAD) / S;
  return SCENERY_BOXES.some(([a, b, c, d]) => lon >= a && lon <= c && lat >= b && lat <= d);
};
const add = (id, polys) => (shapes[id] = (shapes[id] ?? []).concat(polys));
const centroidOf = (poly) => {
  const pts = poly[0];
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
};

for (const [rid, mp] of Object.entries(regionPolys)) {
  if (REGION_DEFS.find((d) => d.id === rid)?.scenery) {
    sceneryPolys.push(...mp);
    continue;
  }
  const regionSeats = territories.filter((t) => t.region === rid && seats[t.id]);
  if (rid === "the-wall") {
    // The Wall is a single territory (castle-black) covering the whole strip.
    add("castle-black", mp);
    continue;
  }
  for (const poly of mp) {
    if (isScenery(poly)) {
      sceneryPolys.push(poly);
      continue;
    }
    const inside = regionSeats.filter((t) => pointInPoly(seats[t.id], poly));
    if (inside.length === 1) {
      add(inside[0].id, [poly]);
    } else if (inside.length > 1) {
      const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
      const bounds = [Math.min(...xs) - 5, Math.min(...ys) - 5, Math.max(...xs) + 5, Math.max(...ys) + 5];
      const vor = new Delaunay(Float64Array.from(inside.flatMap((t) => seats[t.id]))).voronoi(bounds);
      inside.forEach((t, i) => {
        const cell = vor.cellPolygon(i);
        const clipped = polygonClipping.intersection(poly, [cell.map((p) => [p[0], p[1]])]);
        add(t.id, dropTiny(clipped, 0.5));
      });
    } else {
      // A seatless polygon (an islet, a far corner): give it to the nearest seat of the region.
      let best = null;
      for (const t of regionSeats) {
        const d = Math.min(...poly[0].map((p) => Math.hypot(p[0] - seats[t.id][0], p[1] - seats[t.id][1])));
        if (!best || d < best.d) best = { id: t.id, d };
      }
      if (best) add(best.id, [poly]);
      else problems.push(`region ${rid}: polygon with no seat and no fallback`);
    }
  }
}
for (const t of territories) if (!shapes[t.id]?.length) problems.push(`territory ${t.id} has no shape`);

// ---------------------------------------------------------------- adjacency
function edgesOf(mp) {
  const e = [];
  for (const poly of mp) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) e.push([ring[i], ring[i + 1]]);
  return e;
}
function bboxOf(mp) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of mp) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
function overlapLength([a1, a2], [b1, b2]) {
  const dx = a2[0] - a1[0], dy = a2[1] - a1[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  const ux = dx / len, uy = dy / len;
  const dist = (p) => Math.abs((p[0] - a1[0]) * uy - (p[1] - a1[1]) * ux);
  if (dist(b1) > EDGE_TOL || dist(b2) > EDGE_TOL) return 0;
  const proj1 = (p) => (p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy;
  const lo = Math.max(0, Math.min(proj1(b1), proj1(b2)));
  const hi = Math.min(len, Math.max(proj1(b1), proj1(b2)));
  return Math.max(0, hi - lo);
}
// Make territories contiguous. Straight-line Voronoi ignores bays, so a piece can end up cut off from the
// rest of its territory (the far shore of Blackwater Bay went to Duskendale). Such a piece is handed to the
// neighbour it touches most. Pieces that touch nobody (islands, islets) stay where they are.
const sharedLength = (pa, pb) => {
  let total = 0;
  for (const ea of edgesOf([pa])) for (const eb of edgesOf([pb])) total += overlapLength(ea, eb);
  return total;
};
const reassigned = [];
for (const t of territories) {
  const list = shapes[t.id];
  if (!list || list.length < 2) continue;
  let main = list.filter((p) => pointInPoly(seats[t.id], p));
  if (!main.length) main = [list.reduce((m, p) => (polyArea(p) > polyArea(m) ? p : m), list[0])];
  for (const piece of [...list]) {
    if (main.includes(piece)) continue;
    if (main.some((m) => sharedLength(piece, m) >= 5)) continue; // still connected
    let best = null;
    for (const u of territories) {
      if (u.id === t.id || u.region !== t.region) continue;
      const d = (shapes[u.id] ?? []).reduce((sum, q) => sum + sharedLength(piece, q), 0);
      if (d >= 10 && (!best || d > best.d)) best = { id: u.id, d };
    }
    if (best) {
      shapes[t.id] = shapes[t.id].filter((p) => p !== piece);
      shapes[best.id].push(piece);
      reassigned.push(`${t.id} -> ${best.id}`);
    }
  }
}
if (reassigned.length) console.log("Reassigned cut-off pieces: " + reassigned.join(", "));
// Merge pieces of a territory that touch each other, so no seam is drawn between them.
for (const t of territories) if (shapes[t.id]?.length > 1) shapes[t.id] = union(shapes[t.id].map((p) => [p]));

const ids = territories.map((t) => t.id);
const edges = Object.fromEntries(ids.map((id) => [id, edgesOf(shapes[id] ?? [])]));
const boxes = Object.fromEntries(ids.map((id) => [id, bboxOf(shapes[id] ?? [[[[0, 0]]]])]));
const adj = Object.fromEntries(ids.map((id) => [id, new Set()]));
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const [a, b] = [boxes[ids[i]], boxes[ids[j]]];
    if (a[0] > b[2] + 3 || b[0] > a[2] + 3 || a[1] > b[3] + 3 || b[1] > a[3] + 3) continue;
    let total = 0;
    for (const ea of edges[ids[i]]) for (const eb of edges[ids[j]]) total += overlapLength(ea, eb);
    if (total >= MIN_SHARED_EDGE) {
      adj[ids[i]].add(ids[j]);
      adj[ids[j]].add(ids[i]);
    }
  }
}
for (const [a, b] of FORCE_NOT_ADJACENT) { adj[a].delete(b); adj[b].delete(a); }

// Sea links: every island with no land neighbor links to its nearest non-island territory, plus extras.
const verts = Object.fromEntries(ids.map((id) => [id, (shapes[id] ?? []).flatMap((poly) => poly[0])]));
const minDist = (a, b) => {
  let d = Infinity;
  for (const p of verts[a]) for (const q of verts[b]) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return d;
};
const isolated = ids.filter((id) => adj[id].size === 0 && !SKIP_AUTO_SEA_LINK.includes(id));
const seaLinks = [];
for (const id of isolated) {
  let best = null;
  for (const other of ids) {
    if (other === id || isolated.includes(other) || SKIP_AUTO_SEA_LINK.includes(other)) continue;
    const d = minDist(id, other);
    if (!best || d < best.d) best = { other, d };
  }
  if (best) seaLinks.push([id, best.other]);
}
for (const l of SEA_LINKS_EXTRA) if (!seaLinks.some(([a, b]) => (a === l[0] && b === l[1]) || (a === l[1] && b === l[0]))) seaLinks.push(l);
for (const [a, b] of seaLinks) { adj[a].add(b); adj[b].add(a); }

// Report differences from the previous adjacency.
const added = [], removed = [];
for (const t of territories) {
  for (const n of adj[t.id]) if (!t.adjacent.includes(n) && t.id < n) added.push(`${t.id}~${n}`);
  for (const n of t.adjacent) if (!adj[t.id].has(n) && t.id < n) removed.push(`${t.id}~${n}`);
}

// ---------------------------------------------------------------- decor
// Lakes: skip any that touch the northern crop line (they would look like cut-off islands at the map
// edge) and clip the rest to land.
const landAll = union([...Object.values(regionPolys), sceneryPolys].filter((m) => m.length));
const lakes = src.lakes
  .map((l) => projMulti(l.poly))
  .filter((mp) => bboxOf(mp)[1] > PAD + 3)
  .map((mp) => polygonClipping.intersection(mp, landAll))
  .map((mp) => dropTiny(mp, 40)) // thin slivers look like stray lines
  .filter((mp) => mp.length)
  .map(multiPath);
const roads = src.roads.map((r) => ({ name: r.name, size: r.size, d: linePath(r.line.map(proj)) }));
// ---------------------------------------------------------------- region labels
const labels = {};
const sceneryLabels = [];
for (const [rid, mp] of Object.entries(regionPolys)) {
  if (SCENERY_REGION_NAMES[rid]) {
    const biggest = mp.reduce((m, p) => (polyArea(p) > polyArea(m) ? p : m), mp[0]);
    const pl = pole(biggest);
    const nm = SCENERY_REGION_NAMES[rid].toUpperCase();
    sceneryLabels.push({ name: nm, pos: [r1(pl.p[0]), r1(pl.p[1])], size: r1(Math.max(13, Math.min(40, (2.1 * pl.d) / (nm.length * 0.85)))) });
    continue;
  }
  const name = (regionsFile.find((r) => r.id === rid)?.name ?? rid).replace(/^The /, "");
  const ov = LABEL_OVERRIDES[rid] ?? {};
  let pos, size;
  if (rid === "the-wall") {
    const a = Math.floor(ov.along * (wallLine.length - 1));
    pos = [wallLine[a][0], wallLine[a][1] - 5];
    size = ov.size;
  } else if (ov.side === "west") {
    const b = bboxOf(mp);
    pos = [b[0] - 12, (b[1] + b[3]) / 2];
    size = ov.size;
  } else {
    const biggest = mp.reduce((m, p) => (polyArea(p) > polyArea(m) ? p : m), mp[0]);
    const pl = pole(biggest);
    pos = pl.p;
    size = Math.max(13, Math.min(40, (2.1 * pl.d) / (name.length * 0.85)));
  }
  labels[rid] = { pos: [r1(pos[0]), r1(pos[1])], size: r1(size), rotate: ov.rotate };
}

// ---------------------------------------------------------------- write
const geo = {
  _comment:
    "Generated by scripts/generate-territories.mjs from scripts/source/westeros-source.json (CC BY-NC-SA 3.0; see README credits). Safe to hand-edit; re-running overwrites. SVG path data in map space.",
  _viewBox: [0, 0, 1000, H],
};
for (const t of territories) geo[t.id] = multiPath(shapes[t.id] ?? []);
geo._regions = Object.fromEntries(Object.entries(regionPolys).filter(([k]) => !SCENERY_REGION_NAMES[k]).map(([k, mp]) => [k, multiPath(mp)]));
geo._sceneryLabels = sceneryLabels;
geo._seaLinks = seaLinks;
geo._lakes = lakes;
geo._roads = roads;
geo._wall = linePath(wallLine);
geo._scenery = multiPath(sceneryPolys);
writeFileSync(join(root, "src/data/territories.geo.json"), JSON.stringify(geo) + "\n");

for (const t of territories) t.adjacent = [...adj[t.id]].sort();
writeFileSync(territoriesPath, JSON.stringify(territories, null, 2) + "\n");

for (const r of regionsFile) {
  const l = labels[r.id];
  if (!l) continue;
  r.labelPos = l.pos;
  r.labelSize = l.size;
  if (l.rotate) r.labelRotate = l.rotate;
  else delete r.labelRotate;
}
writeFileSync(regionsPath, JSON.stringify(regionsFile, null, 2) + "\n");

console.log(`Map space 1000 x ${H}. Wrote geometry for ${ids.length} territories.`);
console.log(`Sea links: ${seaLinks.map((l) => l.join("~")).join(", ")}`);
console.log(`Adjacency vs previous: +${added.length} -${removed.length}`);
if (added.length) console.log("  added:   " + added.join(" "));
if (removed.length) console.log("  removed: " + removed.join(" "));
if (problems.length) {
  console.error("PROBLEMS:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
