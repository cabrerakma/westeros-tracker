import { TERRITORIES } from "../data";
import type { Faction, LogEntry } from "../types";

interface Props {
  log: LogEntry[];
  factions: Faction[];
  limit?: number;
}

function describe(e: LogEntry, factionName: (id?: string) => string): string {
  const place = TERRITORIES.find((t) => t.id === e.territory)?.name;
  switch (e.action) {
    case "holder-changed":
      return `${place}: ${factionName(e.from)} to ${factionName(e.to)}`;
    case "scenario-loaded":
      return `Map reset to: ${e.note}`;
    case "undo":
      return "Undid the last change";
    case "redo":
      return "Redid a change";
    default:
      return e.action;
  }
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function LogPanel({ log, factions, limit = 20 }: Props) {
  const factionName = (id?: string) => (id === "neutral" ? "Unclaimed" : (factions.find((f) => f.id === id)?.name.replace(/^House /, "") ?? id ?? "?"));
  return (
    <section className="log">
      <h2>Recent changes</h2>
      {log.length === 0 ? (
        <p className="muted small">Nothing has changed yet.</p>
      ) : (
        <ul>
          {log.slice(0, limit).map((e) => (
            <li key={e.id}>
              <span className="log-text">{describe(e, factionName)}</span>
              <span className="log-time">{when(e.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
