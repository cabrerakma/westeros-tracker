import { useState } from "react";
import { battlesFor, factionLabel, fromDateInput, knownPlayers, parsePlayers, territoryName, territoryStats, toDateInput } from "../state/battles";
import type { Battle, Faction, FactionId, Territory } from "../types";

export interface BattleInput {
  date: string; // ISO
  attacker: Battle["attacker"];
  defender: Battle["defender"];
  outcome: Battle["outcome"];
  note: string;
}

interface Props {
  territory: Territory;
  holder: FactionId;
  battles: Battle[]; // all battles; filtered here
  factions: Faction[];
  gm: boolean;
  onAdd(input: BattleInput, applyHolder: boolean): void;
  onEdit(id: string, input: BattleInput): void;
  onDelete(id: string): void;
  onSetHolder(holder: FactionId): void;
}

const OUTCOME_LABEL: Record<Battle["outcome"], string> = { captured: "Captured", repelled: "Repelled", draw: "Draw" };
const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const todayInput = () => toDateInput(new Date().toISOString());

export function BattlePanel({ territory, holder, battles, factions, gm, onAdd, onEdit, onDelete, onSetHolder }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const label = (id: FactionId) => factionLabel(factions, id);
  const list = battlesFor(battles, territory.id);
  const stats = territoryStats(battles, territory.id);
  const players = knownPlayers(battles);

  const side = (s: Battle["attacker"]) => (s.players.length ? `${label(s.faction)} (${s.players.join(", ")})` : label(s.faction));

  const save = (input: BattleInput, applyHolder: boolean, existing?: Battle) => {
    if (!existing) {
      onAdd(input, applyHolder);
    } else {
      onEdit(existing.id, input);
      // Editing only changes the history. If the holder no longer matches what the battle says, ask.
      const wasCapture = existing.outcome === "captured" && existing.holderAfter !== existing.holderBefore;
      const nowAfter = input.outcome === "captured" ? input.attacker.faction : existing.holderBefore;
      if (wasCapture && holder === existing.holderAfter && nowAfter !== existing.holderAfter) {
        if (window.confirm(`This battle used to give ${territory.name} to ${label(existing.holderAfter)}.\n\nSet ${territory.name} to ${label(nowAfter)} now?`)) onSetHolder(nowAfter);
      } else if (!wasCapture && input.outcome === "captured" && holder !== input.attacker.faction) {
        if (window.confirm(`This battle now counts as a capture.\n\nGive ${territory.name} to ${label(input.attacker.faction)}?`)) onSetHolder(input.attacker.faction);
      }
    }
    setEditing(null);
  };

  const remove = (b: Battle) => {
    if (!window.confirm("Delete this battle from the history?")) return;
    onDelete(b.id);
    if (b.outcome === "captured" && b.holderAfter !== b.holderBefore && holder === b.holderAfter) {
      if (window.confirm(`That battle had given ${territory.name} to ${label(b.holderAfter)}.\n\nChange it back to ${label(b.holderBefore)}?`)) onSetHolder(b.holderBefore);
    }
  };

  return (
    <section className="battles">
      <h2>Battles</h2>
      <p className="muted small">
        {stats.fought === 0 ? "No battles here yet." : `Fought ${stats.fought} ${stats.fought === 1 ? "time" : "times"}. Changed hands ${stats.changedHands} ${stats.changedHands === 1 ? "time" : "times"}.`}
      </p>

      {gm && editing === null && <button onClick={() => setEditing("new")}>Record a battle</button>}
      {gm && editing === "new" && (
        <BattleForm territory={territory} holder={holder} factions={factions} players={players} onSave={(i, apply) => save(i, apply)} onCancel={() => setEditing(null)} />
      )}

      <ul className="battle-list">
        {list.map((b) =>
          editing === b.id ? (
            <li key={b.id}>
              <BattleForm territory={territory} holder={holder} factions={factions} players={players} existing={b} onSave={(i, apply) => save(i, apply, b)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={b.id}>
              <div className="battle-head">
                <span className="battle-date">{dateText(b.timestamp)}</span>
                <span className={"battle-outcome " + b.outcome}>{OUTCOME_LABEL[b.outcome]}</span>
              </div>
              <div>
                {side(b.attacker)} attacked {side(b.defender)}
              </div>
              {b.outcome === "captured" && b.holderAfter !== b.holderBefore && (
                <div className="muted small">
                  {territoryName(b.territory)} went from {label(b.holderBefore)} to {label(b.holderAfter)}.
                </div>
              )}
              {b.note && <div className="battle-note">{b.note}</div>}
              {gm && editing === null && (
                <div className="battle-actions">
                  <button onClick={() => setEditing(b.id)}>Edit</button>
                  <button className="danger" onClick={() => remove(b)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

interface FormProps {
  territory: Territory;
  holder: FactionId;
  factions: Faction[];
  players: string[];
  existing?: Battle;
  onSave(input: BattleInput, applyHolder: boolean): void;
  onCancel(): void;
}

function BattleForm({ territory, holder, factions, players, existing, onSave, onCancel }: FormProps) {
  const [date, setDate] = useState(existing ? toDateInput(existing.timestamp) : todayInput());
  const [attacker, setAttacker] = useState<FactionId>(existing?.attacker.faction ?? "");
  const [defender, setDefender] = useState<FactionId>(existing?.defender.faction ?? holder);
  const [attackerPlayers, setAttackerPlayers] = useState(existing?.attacker.players.join(", ") ?? "");
  const [defenderPlayers, setDefenderPlayers] = useState(existing?.defender.players.join(", ") ?? "");
  const [outcome, setOutcome] = useState<Battle["outcome"]>(existing?.outcome ?? "captured");
  const [note, setNote] = useState(existing?.note ?? "");
  const [applyHolder, setApplyHolder] = useState(true);
  const [error, setError] = useState("");

  const nameOf = (f: Faction) => (f.id === "neutral" ? "Unclaimed" : f.name);
  const canChangeHolder = !existing && outcome === "captured" && !!attacker && attacker !== holder;

  const submit = () => {
    if (!attacker) return setError("Pick the attacking faction.");
    if (attacker === defender) return setError("The attacker and defender must be different factions.");
    if (!date) return setError("Pick a date.");
    onSave(
      {
        date: fromDateInput(date),
        attacker: { faction: attacker, players: parsePlayers(attackerPlayers) },
        defender: { faction: defender, players: parsePlayers(defenderPlayers) },
        outcome,
        note,
      },
      canChangeHolder && applyHolder,
    );
  };

  return (
    <div className="battle-form">
      <h3>{existing ? "Edit battle" : `Record a battle at ${territory.name}`}</h3>
      <datalist id="known-players">
        {players.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Attacker
        <select value={attacker} onChange={(e) => setAttacker(e.target.value)}>
          <option value="">Choose a faction…</option>
          {factions
            .filter((f) => f.id !== "neutral")
            .map((f) => (
              <option key={f.id} value={f.id}>
                {nameOf(f)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Attacking player(s)
        <input list="known-players" value={attackerPlayers} onChange={(e) => setAttackerPlayers(e.target.value)} placeholder="Names, separated by commas" />
      </label>
      <label>
        Defender
        <select value={defender} onChange={(e) => setDefender(e.target.value)}>
          {factions.map((f) => (
            <option key={f.id} value={f.id}>
              {nameOf(f)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Defending player(s)
        <input list="known-players" value={defenderPlayers} onChange={(e) => setDefenderPlayers(e.target.value)} placeholder="Names, separated by commas" />
      </label>
      <label>
        Outcome
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as Battle["outcome"])}>
          <option value="captured">Captured by the attacker</option>
          <option value="repelled">Attack repelled</option>
          <option value="draw">Draw</option>
        </select>
      </label>
      {canChangeHolder && (
        <label className="check">
          <input type="checkbox" checked={applyHolder} onChange={(e) => setApplyHolder(e.target.checked)} /> Also give {territory.name} to the attacker
        </label>
      )}
      <label>
        Notes
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="battle-actions">
        <button onClick={submit}>{existing ? "Save changes" : "Save battle"}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
