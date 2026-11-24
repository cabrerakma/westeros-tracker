import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SCENARIOS, TERRITORIES } from "./data";
import { MapView, type Layers, type MapHandle } from "./map/MapView";
import { checkPasscode } from "./state/gm";
import { historyReducer, initialHistory, initialState, newMeta } from "./state/game";
import { downloadBackup, loadState, saveState } from "./state/persistence";
import { BattlePanel, type BattleInput } from "./ui/BattlePanel";
import { Legend } from "./ui/Legend";
import { LogPanel } from "./ui/LogPanel";
import { TerritoryPanel } from "./ui/TerritoryPanel";

const LAYER_LABELS: [keyof Layers, string][] = [
  ["regionBorders", "Region borders"],
  ["regionNames", "Region names"],
  ["regionCaptions", "Region captions"],
  ["castleLabels", "Castle labels"],
];

export function App() {
  // The saved map from this browser if there is one, otherwise the default start.
  const [hist, dispatch] = useReducer(historyReducer, null, () => initialHistory(loadState() ?? initialState()));
  const state = hist.present;
  useEffect(() => saveState(state), [state]);

  const [gm, setGm] = useState(false); // always starts in View mode
  const [paintId, setPaintId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"key" | "territory" | "changes">("key");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<Layers>({ regionBorders: true, regionNames: true, regionCaptions: true, castleLabels: true });
  const [resetTo, setResetTo] = useState("war-of-five-kings");
  const map = useRef<MapHandle>(null);

  const factions = state.factions;
  const holders = useMemo(() => Object.fromEntries(Object.entries(state.territories).map(([id, s]) => [id, s.holder])), [state.territories]);
  const selected = TERRITORIES.find((t) => t.id === selectedId);
  const paintFaction = paintId ? factions.find((f) => f.id === paintId) : undefined;
  const paintName = paintId === "neutral" ? "Unclaimed" : paintFaction?.name;

  const setHolder = useCallback((territory: string, holder: string) => dispatch({ type: "setHolder", territory, holder, ...newMeta() }), []);
  const undo = useCallback(() => dispatch({ type: "undo", ...newMeta() }), []);
  const redo = useCallback(() => dispatch({ type: "redo", ...newMeta() }), []);

  const enterGm = () => {
    if (checkPasscode(window.prompt("GM passcode"))) setGm(true);
    else window.alert("That passcode is not right.");
  };
  const leaveGm = () => {
    setGm(false);
    setPaintId(null);
  };

  const handleSelect = useCallback(
    (id: string | null) => {
      const painting = !!(id && gm && paintId);
      if (painting) setHolder(id!, paintId!);
      setSelectedId(id);
      if (id && !painting) setTab("territory"); // while painting, stay on the key
      if (id === null && tab === "territory") setTab("key");
    },
    [gm, paintId, setHolder, tab],
  );

  // Keyboard: Esc stops painting; Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z or Ctrl+Y redoes (GM mode only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if (e.key === "Escape") setPaintId(null);
      if (!gm || typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gm, undo, redo]);

  const reset = () => {
    const name = SCENARIOS[resetTo].name;
    if (!window.confirm(`Reset the whole map to "${name}"?\n\nA backup file of the current map is downloaded first, and you can still undo.`)) return;
    downloadBackup(state, "westeros-backup-before-reset");
    dispatch({ type: "loadScenario", scenarioId: resetTo, ...newMeta() });
    setPaintId(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Westeros Tracker</h1>
        {gm && <span className="badge">GM mode</span>}
        <div className="spacer" />
        {gm && (
          <>
            <button onClick={undo} disabled={hist.past.length === 0} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button onClick={redo} disabled={hist.future.length === 0} title="Redo (Shift+Ctrl+Z)">
              Redo
            </button>
          </>
        )}
        <button onClick={() => map.current?.fit()}>Fit all</button>
        <details className="layers">
          <summary>Layers</summary>
          <div className="layer-menu">
            {LAYER_LABELS.map(([key, label]) => (
              <label key={key}>
                <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
        </details>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>
          {sidebarOpen ? "Hide panel" : "Show panel"}
        </button>
        <button className={gm ? "gm-on" : ""} onClick={gm ? leaveGm : enterGm}>
          {gm ? "Exit GM mode" : "GM mode"}
        </button>
      </header>
      {gm && paintId && (
        <div className="paint-banner">
          Painting with <b>{paintName}</b>. Click territories to give them to it.
          <button onClick={() => setPaintId(null)}>Stop (Esc)</button>
        </div>
      )}
      <div className="body">
        <MapView ref={map} holders={holders} factions={factions} selectedId={selectedId} onSelect={handleSelect} layers={layers} paintMode={gm && !!paintId} />
        {sidebarOpen && (
          <aside className="sidebar">
            <nav className="tabs" role="tablist">
              {(
                [
                  ["key", "Key"],
                  ["territory", selected ? selected.name : "Territory"],
                  ["changes", "Changes"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </nav>
            <div hidden={tab !== "key"}>
              <Legend factions={factions} holders={holders} gm={gm} paintId={paintId} onPick={(id) => setPaintId(paintId === id ? null : id)} />
            </div>
            <div hidden={tab !== "territory"}>
            {selected ? (
              <TerritoryPanel
                key={selected.id + "|" + (state.territories[selected.id]?.note ?? "")}
                territory={selected}
                holder={holders[selected.id]}
                note={state.territories[selected.id]?.note}
                factions={factions}
                gm={gm}
                onHolder={(h) => setHolder(selected.id, h)}
                onNote={(note) => dispatch({ type: "setNote", territory: selected.id, note, ...newMeta() })}
                onSelect={setSelectedId}
                onZoom={() => map.current?.zoomTo(selected.id)}
              />
            ) : (
              <section>
                <h2>Westeros</h2>
                <p>Click a territory to see its details. Drag to pan, scroll or pinch to zoom.</p>
              </section>
            )}
            {selected && (
              <BattlePanel
                key={"battles-" + selected.id}
                territory={selected}
                holder={holders[selected.id]}
                battles={state.battles}
                factions={factions}
                gm={gm}
                onAdd={(i: BattleInput, applyHolder) =>
                  dispatch({ type: "addBattle", battleId: newMeta().id, territory: selected.id, date: i.date, attacker: i.attacker, defender: i.defender, outcome: i.outcome, note: i.note, applyHolder, ...newMeta() })
                }
                onEdit={(id, i) => dispatch({ type: "editBattle", battleId: id, changes: { timestamp: i.date, attacker: i.attacker, defender: i.defender, outcome: i.outcome, note: i.note }, ...newMeta() })}
                onDelete={(id) => dispatch({ type: "deleteBattle", battleId: id, ...newMeta() })}
                onSetHolder={(h) => setHolder(selected.id, h)}
              />
            )}
            </div>
            <div hidden={tab !== "changes"}>
            <LogPanel log={state.log} factions={factions} />
            {gm && (
              <section className="reset">
                <h2>Reset the map</h2>
                <p className="muted small">Puts every holder back to a starting position. A backup file downloads first, and you can undo.</p>
                <select value={resetTo} onChange={(e) => setResetTo(e.target.value)} aria-label="Starting position">
                  {Object.values(SCENARIOS).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button className="danger" onClick={reset}>
                  Reset…
                </button>
              </section>
            )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
