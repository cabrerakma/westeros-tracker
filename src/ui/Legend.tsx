import { holderFill } from "../map/colors";
import type { Faction, FactionId } from "../types";
import { shortFactionName } from "../state/status";

interface Props {
  factions: Faction[];
  holders: Record<string, FactionId>;
  /** Click a faction to select it (used later for dimming everything else). */
  onPick?(id: FactionId): void;
}

/** Colour key: who holds how many territories, with the same colours as the map. */
export function Legend({ factions, holders, onPick }: Props) {
  const counts: Record<string, number> = {};
  for (const h of Object.values(holders)) counts[h] = (counts[h] ?? 0) + 1;
  const real = factions.filter((f) => f.id !== "neutral");
  const holding = real.filter((f) => (counts[f.id] ?? 0) > 0).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  const landless = real.filter((f) => !(counts[f.id] ?? 0));
  const unclaimed = counts["neutral"] ?? 0;

  return (
    <section className="legend">
      <h2>Who holds what</h2>
      <ul>
        {holding.map((f) => (
          <li key={f.id}>
            <button className="legend-row" onClick={() => onPick?.(f.id)}>
              <span className="swatch" style={{ background: holderFill(f.color) }} />
              <span className="legend-name">{f.name}</span>
              <span className="legend-count">{counts[f.id]}</span>
            </button>
          </li>
        ))}
        {unclaimed > 0 && (
          <li>
            <span className="legend-row static">
              <span className="swatch hatch" />
              <span className="legend-name">Unclaimed</span>
              <span className="legend-count">{unclaimed}</span>
            </span>
          </li>
        )}
      </ul>
      {landless.length > 0 && <p className="muted small">No land: {landless.map(shortFactionName).join(", ")}</p>}
      <p className="muted small">
        <span className="swatch ring" /> A coloured edge on a territory shows its original owner when someone else holds it.
      </p>
    </section>
  );
}
