const PARCHMENT = [239, 228, 200];
const TINT = 0.6; // how strongly the holder's colour covers the parchment

/** Parchment with the faction colour laid over it, so the map still shows through. */
export function holderFill(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const m = c.map((v, i) => Math.round(PARCHMENT[i] + (v - PARCHMENT[i]) * TINT));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
