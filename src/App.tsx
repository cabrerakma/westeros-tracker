import { useMemo, useRef, useState } from "react";
import { DEFAULT_SCENARIO_ID, REGIONS, SCENARIOS, TERRITORIES } from "./data";
import { MapView, type Layers, type MapHandle } from "./map/MapView";
import { controlState } from "./state/status";

const LAYER_LABELS: [keyof Layers, string][] = [
  ["regionBorders", "Region borders"],
  ["regionNames", "Region names"],
  ["regionCaptions", "Region captions"],
  ["castleLabels", "Castle labels"],
  ["decor", "Rivers and mountains"],
];

// M1: holders are read-only, straight from the default scenario. Editing arrives in M2.
export function App() {
  const scenario = SCENARIOS[DEFAULT_SCENARIO_ID];
  const factions = scenario.factions;
  const holders = useMemo(() => Object.fromEntries(Object.entries(scenario.territories).map(([id, s]) => [id, s.holder])), [scenario]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<Layers>({ regionBorders: true, regionNames: true, regionCaptions: true, castleLabels: true, decor: true });
  const map = useRef<MapHandle>(null);

  const selected = TERRITORIES.find((t) => t.id === selectedId);
  const factionName = (id: string) => factions.find((f) => f.id === id)?.name ?? id;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Westeros Tracker</h1>
        <div className="spacer" />
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
      </header>
      <div className="body">
        <MapView ref={map} holders={holders} factions={factions} selectedId={selectedId} onSelect={setSelectedId} layers={layers} />
        {sidebarOpen && (
          <aside className="sidebar">
            {selected ? (
              <section>
                <h2>{selected.name}</h2>
                <dl>
                  <dt>Seat house</dt>
                  <dd>{selected.seatHouse}</dd>
                  <dt>Region</dt>
                  <dd>{REGIONS.find((r) => r.id === selected.region)?.name}</dd>
                  <dt>Held by</dt>
                  <dd>{factionName(holders[selected.id])}</dd>
                  <dt>Home faction</dt>
                  <dd>{factionName(selected.homeFaction)}</dd>
                  <dt>State</dt>
                  <dd>{controlState(holders[selected.id], selected.homeFaction)}</dd>
                  <dt>Tier</dt>
                  <dd>{selected.tier}</dd>
                  <dt>Neighbors</dt>
                  <dd>
                    {selected.adjacent.map((n) => (
                      <button key={n} className="link" onClick={() => setSelectedId(n)}>
                        {TERRITORIES.find((t) => t.id === n)?.name}
                      </button>
                    ))}
                  </dd>
                </dl>
                <button onClick={() => map.current?.zoomTo(selected.id)}>Zoom to territory</button>
              </section>
            ) : (
              <section>
                <h2>Westeros</h2>
                <p>Click a territory to see its details. Drag to pan, scroll or pinch to zoom.</p>
                <p className="muted">M1: static map. Control, banners and the GM tools arrive in M2.</p>
              </section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
