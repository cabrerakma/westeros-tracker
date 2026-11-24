import { useState } from "react";
import { REGIONS, TERRITORIES } from "../data";
import { controlState } from "../state/status";
import type { Faction, FactionId, Territory } from "../types";

interface Props {
  territory: Territory;
  holder: FactionId;
  note?: string;
  factions: Faction[];
  gm: boolean;
  onHolder(holder: FactionId): void;
  onNote(note: string): void;
  onSelect(id: string): void;
  onZoom(): void;
}

const STATE_TEXT = { controlled: "Held by its home faction", occupied: "Occupied (held by another faction)", unclaimed: "Unclaimed" } as const;

export function TerritoryPanel({ territory: t, holder, note, factions, gm, onHolder, onNote, onSelect, onZoom }: Props) {
  const name = (id: string) => (id === "neutral" ? "Unclaimed" : (factions.find((f) => f.id === id)?.name ?? id));
  const [draft, setDraft] = useState(note ?? "");
  const state = controlState(holder, t.homeFaction);

  return (
    <section className="territory-panel">
      <h2>{t.name}</h2>
      <dl>
        <dt>Seat house</dt>
        <dd>{t.seatHouse}</dd>
        <dt>Region</dt>
        <dd>{REGIONS.find((r) => r.id === t.region)?.name}</dd>
        <dt>Held by</dt>
        <dd>
          {gm ? (
            <select value={holder} onChange={(e) => onHolder(e.target.value)} aria-label="Holder">
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {name(f.id)}
                </option>
              ))}
            </select>
          ) : (
            name(holder)
          )}
        </dd>
        <dt>Home faction</dt>
        <dd>{name(t.homeFaction)}</dd>
        <dt>State</dt>
        <dd>{STATE_TEXT[state]}</dd>
        <dt>Neighbors</dt>
        <dd>
          {t.adjacent.map((n) => (
            <button key={n} className="link" onClick={() => onSelect(n)}>
              {TERRITORIES.find((x) => x.id === n)?.name}
            </button>
          ))}
        </dd>
      </dl>

      <label className="note-label">
        Notes
        {gm ? (
          <textarea
            value={draft}
            rows={3}
            placeholder="Anything to remember about this place"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft.trim() !== (note ?? "") && onNote(draft)}
          />
        ) : (
          <p className="note-text">{note || <span className="muted">No notes.</span>}</p>
        )}
      </label>

      <button onClick={onZoom}>Zoom to territory</button>
    </section>
  );
}
