// Color-blind / grayscale check for faction colors (spec section 4).
// Usage: node scripts/check-colors.mjs [--threshold 12] [--alt]
// Simulates protanopia and deuteranopia (Machado 2009, severity 1.0) and grayscale,
// then lists faction pairs whose CIE76 color difference is under the threshold.
// Pairs flagged here must be told apart by glyph/pattern too. Exits 0 (advisory) unless --strict.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const threshold = Number(args[args.indexOf("--threshold") + 1]) || 12;
const useAlt = args.includes("--alt");
const strict = args.includes("--strict");

const factions = JSON.parse(readFileSync(join(root, "src/data/factions.json"), "utf8")).filter((f) => f.id !== "neutral");

const toLin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const hex = (h) => [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16)));
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const clamp = (x) => Math.min(1, Math.max(0, x));

const SIMS = {
  normal: null,
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  grayscale: "gray",
};

function simulate(rgb, kind) {
  const m = SIMS[kind];
  if (!m) return rgb;
  if (m === "gray") {
    const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return [y, y, y];
  }
  return mul(m, rgb).map(clamp);
}

function toLab([r, g, b]) {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const colorOf = (f) => (useAlt && f.altColor ? f.altColor : f.color);
const labs = Object.fromEntries(
  factions.map((f) => [f.id, Object.fromEntries(Object.keys(SIMS).map((k) => [k, toLab(simulate(hex(colorOf(f)), k))]))]),
);

const flagged = [];
for (let i = 0; i < factions.length; i++) {
  for (let j = i + 1; j < factions.length; j++) {
    const a = factions[i], b = factions[j];
    let worst = { kind: "", de: Infinity };
    for (const k of Object.keys(SIMS)) {
      const de = dE(labs[a.id][k], labs[b.id][k]);
      if (de < worst.de) worst = { kind: k, de };
    }
    if (worst.de < threshold) flagged.push({ a: a.id, b: b.id, ...worst });
  }
}

flagged.sort((x, y) => x.de - y.de);
console.log(`Checked ${factions.length} factions (${(factions.length * (factions.length - 1)) / 2} pairs), threshold ΔE < ${threshold}${useAlt ? " (altColor)" : ""}.`);
if (!flagged.length) {
  console.log("All pairs distinguishable by color alone under every simulation.");
} else {
  console.log(`${flagged.length} pair(s) need glyph/pattern help (worst simulation shown):`);
  for (const f of flagged) console.log(`  ${f.a.padEnd(12)} vs ${f.b.padEnd(12)} ΔE ${f.de.toFixed(1).padStart(5)}  [${f.kind}]`);
}
if (strict && flagged.length) process.exit(1);
