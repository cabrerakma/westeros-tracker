import { holderFill } from "../map/colors";
import type { Faction, FactionId } from "../types";

interface Props {
  factions: Faction[];
  holders: Record<string, FactionId>;
  /** GM mode: rows are buttons that pick the faction to paint with. */
  gm?: boolean;
  paintId?: FactionId | null;
  onPick?(id: FactionId): void;
}

/** Colour key: who holds how many territories, with the same colours as the map. */
export function Legend({ factions, holders, gm, paintId, onPick }: Props) {
  const counts: Record<string, number> = {};
  for (const h of Object.values(holders)) counts[h] = (counts[h] ?? 0) + 1;
  const real = factions.filter((f) => f.id !== "neutral");
  const rows = [...real].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  const unclaimed = counts["neutral"] ?? 0;

  return (
    <section className="legend">
      <h2>Who holds what</h2>
      {gm && <p className="muted small">Pick a faction, then click territories on the map to give them to it.</p>}
      <ul>
        {rows.map((f) => (
          <li key={f.id}>
            <button
              className={"legend-row" + (counts[f.id] ? "" : " none") + (paintId === f.id ? " active" : "")}
              onClick={() => onPick?.(f.id)}
              disabled={!gm}
              aria-pressed={gm ? paintId === f.id : undefined}
            >
              <span className="swatch" style={{ background: holderFill(f.color) }} />
              <span className="legend-name">{f.name}</span>
              <span className="legend-count">{counts[f.id] ?? 0}</span>
            </button>
          </li>
        ))}
        {(unclaimed > 0 || gm) && (
          <li>
            <button
              className={"legend-row" + (unclaimed ? "" : " none") + (paintId === "neutral" ? " active" : "")}
              onClick={() => onPick?.("neutral")}
              disabled={!gm}
              aria-pressed={gm ? paintId === "neutral" : undefined}
            >
              <span className="swatch hatch" />
              <span className="legend-name">Unclaimed</span>
              <span className="legend-count">{unclaimed}</span>
            </button>
          </li>
        )}
      </ul>
      <p className="muted small">
        <span className="swatch ring" /> A coloured edge on a territory shows its original owner when someone else holds it.
      </p>
    </section>
  );
}
