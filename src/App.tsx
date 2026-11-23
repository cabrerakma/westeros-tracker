import { FACTIONS, REGIONS, TERRITORIES } from "./data";

// M0 placeholder: confirms the data loads. The map arrives in M1.
export function App() {
  return (
    <main style={{ fontFamily: "Georgia, serif", padding: 24 }}>
      <h1>Westeros Tracker</h1>
      <p>
        M0 scaffold: {FACTIONS.length} factions, {REGIONS.length} regions, {TERRITORIES.length} territories loaded.
      </p>
    </main>
  );
}
