import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FACTIONS, SCENARIOS, TERRITORIES } from "./data";
import { MapView, type Layers, type MapHandle } from "./map/MapView";
import { checkPasscode } from "./state/gm";
import { historyReducer, initialHistory, initialState, newMeta, normalizeState } from "./state/game";
import type { GameState } from "./types";
import { loadCampaign, stateKey } from "./state/campaign";
import { downloadBackup, downloadCampaign } from "./state/persistence";
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
  // Everyone sees the published map, campaign.json. Nothing is stored in the browser.
  const [hist, dispatch] = useReducer(historyReducer, null, () => initialHistory(initialState()));
  const state = hist.present;
  const [loaded, setLoaded] = useState(false);
  const [published, setPublished] = useState<GameState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null); // the version last saved to a file

  useEffect(() => {
    let cancelled = false;
    loadCampaign()
      .then((s) => {
        if (cancelled) return;
        setPublished(s);
        dispatch({ type: "replaceHistory", state: s });
      })
      .catch((e) => {
        if (cancelled) return;
        const fallback = initialState();
        setPublished(fallback);
        dispatch({ type: "replaceHistory", state: fallback });
        setNotice(`Could not load the published map (${e instanceof Error ? e.message : e}). Showing the default start instead.`);
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const [gm, setGm] = useState(false); // always starts in View mode
  const [paintId, setPaintId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"key" | "territory" | "changes">("key");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<Layers>({ regionBorders: true, regionNames: true, regionCaptions: true, castleLabels: true });
  const [resetTo, setResetTo] = useState("war-of-five-kings");

  // Is the map you are looking at the same as the published one, or the last file you saved?
  const key = useMemo(() => stateKey(state), [state]);
  const publishedKey = useMemo(() => (published ? stateKey(published) : null), [published]);
  const unsaved = gm && key !== (savedKey ?? publishedKey);
  const unpublished = loaded && key !== publishedKey;

  // Closing or refreshing with unsaved edits would lose them, so the browser asks first.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const map = useRef<MapHandle>(null);

  const factions = state.factions;
  // Color-blind-safe palette: only changes how colors are drawn, never the data.
  const [cbSafe, setCbSafe] = useState(false);
  const shownFactions = useMemo(
    () => (cbSafe ? factions.map((f) => ({ ...f, color: FACTIONS.find((d) => d.id === f.id)?.altColor ?? f.color })) : factions),
    [cbSafe, factions],
  );
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
    if (!window.confirm(`Reset the whole map to "${name}"?\n\nThis also clears the battle history and the change log. A backup file of everything is downloaded first, and you can still undo.`)) return;
    downloadBackup(state, "westeros-backup-before-reset");
    dispatch({ type: "loadScenario", scenarioId: resetTo, ...newMeta() });
    setPaintId(null);
  };

  const saveToFile = () => {
    downloadCampaign(state);
    setSavedKey(key);
    setNotice("Saved campaign.json to your Downloads folder. To publish it: replace public/campaign.json in the repository with this file, then commit and push.");
  };
  const loadFromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const loaded = normalizeState(JSON.parse(await file.text()));
      if (!loaded) throw new Error("not a Westeros map file");
      if (!window.confirm(`Replace the current map with the one in "${file.name}"?\n\nYou can still undo.`)) return;
      dispatch({ type: "importState", state: loaded, ...newMeta() });
      setPaintId(null);
    } catch {
      window.alert("That file could not be read as a Westeros map. Nothing was changed.");
    }
  };

  if (!loaded) return <div className="loading">Loading the map…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Westeros Tracker</h1>
        {gm && <span className="badge">GM mode</span>}
        {unsaved ? (
          <span className="badge warn">Unsaved changes</span>
        ) : (
          unpublished && <span className="badge info">{gm ? "Saved to file, not published yet" : "Not published yet (only you see this)"}</span>
        )}
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
        {gm && (
          <button className="primary" onClick={saveToFile} title="Download campaign.json to publish">
            Save to file
          </button>
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
            <label>
              <input type="checkbox" checked={cbSafe} onChange={(e) => setCbSafe(e.target.checked)} /> Color-blind friendly colors
            </label>
          </div>
        </details>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>
          {sidebarOpen ? "Hide panel" : "Show panel"}
        </button>
        <button className={gm ? "gm-on" : ""} onClick={gm ? leaveGm : enterGm}>
          {gm ? "Exit GM mode" : "GM mode"}
        </button>
      </header>
      {notice && (
        <div className="notice-banner">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {gm && paintId && (
        <div className="paint-banner">
          Painting with <b>{paintName}</b>. Click territories to give them to it.
          <button onClick={() => setPaintId(null)}>Stop (Esc)</button>
        </div>
      )}
      <div className="body">
        <MapView ref={map} holders={holders} factions={shownFactions} selectedId={selectedId} onSelect={handleSelect} layers={layers} paintMode={gm && !!paintId} />
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
              <Legend factions={shownFactions} holders={holders} gm={gm} paintId={paintId} onPick={(id) => setPaintId(paintId === id ? null : id)} />
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
                <h2>Publish and load</h2>
                <p className="muted small">Everyone sees the map in campaign.json. "Save to file" (top bar) downloads a new one; replace the file in the repository and push to publish it. Nothing is stored in this browser.</p>
                <div className="battle-actions">
                  <label className="file-button">
                    Load from file…
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        loadFromFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <h2>Reset the map</h2>
                <p className="muted small">Puts every holder back to a starting position and clears the battle history and change log. A backup file of everything downloads first, and you can undo.</p>
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
