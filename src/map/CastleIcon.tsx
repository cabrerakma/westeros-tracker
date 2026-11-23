import type { Tier } from "../types";

const SIZE: Record<Tier, number> = { city: 25, fortress: 20, castle: 16, holdfast: 12 };

/** Simple original castle mark, centered on the seat point. Size depends on tier. */
export function CastleIcon({ tier }: { tier: Tier }) {
  const s = SIZE[tier];
  const w = s;
  const h = s * 0.85;
  const x = -w / 2;
  const y = -h / 2;
  const m = w / 7; // crenel width
  if (tier === "holdfast") {
    // A small tower.
    return (
      <g className="castle">
        <path d={`M${x + w * 0.2} ${y + h}V${y + h * 0.25}H${x + w * 0.8}V${y + h}Z`} />
        <path d={`M${x + w * 0.2} ${y + h * 0.25}l${m * 0.5} -${m}h${m * 0.8}v${m}`} />
        <path d={`M${x + w * 0.62} ${y + h * 0.25}v-${m}h${m * 0.8}l${m * 0.1} ${m}`} />
      </g>
    );
  }
  const towers = tier === "castle" ? 2 : 3;
  const tw = w / (towers * 2 - 1);
  return (
    <g className="castle">
      {/* curtain wall */}
      <rect x={x} y={y + h * 0.4} width={w} height={h * 0.6} />
      {/* towers with crenellations */}
      {Array.from({ length: towers }, (_, i) => {
        const tx = x + i * tw * 2 - (i === 0 ? 0 : 0);
        const th = tier === "city" && i === 1 ? h : h * 0.8;
        return (
          <g key={i}>
            <rect x={tx} y={y + h - th} width={tw} height={th} />
            <path d={`M${tx - 1} ${y + h - th}h${tw + 2}`} className="cren" />
          </g>
        );
      })}
      {/* gate */}
      <path d={`M${-tw * 0.3} ${y + h}v-${h * 0.22}a${tw * 0.3} ${tw * 0.3} 0 0 1 ${tw * 0.6} 0v${h * 0.22}Z`} className="gate" />
    </g>
  );
}
