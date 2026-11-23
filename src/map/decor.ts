// Decorative rivers, roads and mountains. Purely visual (pointer-events: none).
export type Pt = [number, number];

export const RIVERS: { id: string; pts: Pt[] }[] = [
  { id: "red-fork", pts: [[610, 960], [570, 1000], [520, 1040], [470, 1060]] },
  { id: "blue-fork", pts: [[330, 1010], [380, 1040], [430, 1062], [470, 1060]] },
  { id: "trident", pts: [[470, 1060], [510, 1090], [550, 1115], [585, 1135]] },
  { id: "blackwater", pts: [[585, 1135], [620, 1170], [650, 1215], [668, 1250]] },
  { id: "mander", pts: [[390, 1385], [330, 1420], [260, 1470], [190, 1520], [142, 1545]] },
  { id: "white-knife", pts: [[505, 575], [560, 640], [630, 700], [720, 750], [758, 764]] },
];

export const ROADS: { id: string; pts: Pt[] }[] = [
  { id: "roseroad", pts: [[650, 1250], [560, 1300], [470, 1332], [390, 1385], [330, 1470], [200, 1550]] },
  { id: "kingsroad-north", pts: [[520, 1000], [520, 920], [520, 820], [500, 570]] },
];

export const MOUNTAINS: Pt[] = [
  // Mountains of the Moon
  [650, 905], [645, 935], [652, 965], [643, 995], [648, 1025], [640, 1055], [646, 1085],
  // Frostfangs
  [250, 190], [285, 165], [320, 182], [268, 140], [312, 128], [352, 150], [240, 235],
  // Red Mountains of Dorne
  [430, 1755], [470, 1775], [510, 1750], [552, 1778], [592, 1762], [500, 1805], [625, 1790],
  // Stony Shore hills / Skagos-ish hills in the North
  [330, 660], [360, 700], [300, 740], [560, 480], [600, 500],
];

/** Smooth open path through points (midpoint quadratic curves). */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${last[0]} ${last[1]}`;
}
