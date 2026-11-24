# Westeros Territory Tracker: Spec v2 for Claude Code

Revised Nov 24, 2026. Supersedes `westeros-map-spec.md`. This version cuts the rules-adjacent features: the map is a tracker, not a rules engine.

> **Revision 3 (Nov 24, 2026) overrides anything below that disagrees:**
> - **Real map.** The geography now comes from the Game of Thrones shapefiles (map by Tear and theMountainGoat, GIS data by cadaei, revised by Patrick Triest; CC BY-NC-SA 3.0, non-commercial, credit required). The "original art" rule is lifted by the owner for this private project. The hand-drawn region polygons and the seed coordinates in section 4 are replaced by the real castle positions; section 3's build method is now: real region polygons, then Voronoi per region.
> - **46 territories, 12 regions.** Pentos and Braavos are added as a new region, The Free Cities, a strip of the Essos west coast. Targaryen starts holding both (home faction Targaryen). Targaryen therefore starts with 2 territories, not 0.
> - **No turns and no game mechanics.** Drop the turn counter, season label, turn numbers in the log, battles, exports and scenarios. Battles keep a date instead. The map only records who holds what, plus a simple history of fights per territory (who fought, who won, players, notes). Capturing may offer to update the holder, nothing more.
> - **Starting holders follow the A Song of Ice and Fire miniatures game:** Joffrey's King's Landing and Duskendale are Lannister, Renly's Stormlands (Storm's End, Bronzegate, Tarth, Nightsong) are Tyrell, and Baratheon (Stannis) starts with Dragonstone only. Home factions stay Baratheon for these, so they show the occupied ring. This overrides the default-holder column in section 3. The map only tracks who holds what.
> - **The Vale is scenery** (irrelevant to the war): it is drawn, labelled and unselectable, like Skagos. That removes its 4 territories and the region, leaving 42 territories in 11 regions. The built-in Unclaimed faction stays for the blank scenario.
> - **Battles can be edited or deleted** by the GM, to fix erroneous reports. Stats are derived from the list, so they update by themselves. Edits and deletions are logged.
> - **Simplest option wins.** Where this spec is ambiguous, build the smaller thing.

## 1. Overview

Build a browser-based, interactive map of Westeros that a small group of friends uses to track which faction controls which territory in a wargame campaign, plus a history of battles fought on each territory. One game master (GM) updates it; everyone else watches live.

**Primary users:** 3 to 10 friends; one GM edits, the rest view.

**Goals**

- Show Westeros as 44 named territories, each anchored on a castle or city, grouped into 9 canonical regions plus the Wall and Beyond the Wall.
- Show the current holder of every territory at a glance through color, banner glyph and, when relevant, an "occupied" ring.
- Let the GM reassign a territory in one or two clicks, with undo and a change log.
- Show a scoreboard: territories held per faction.
- Record battles per territory (who fought, who won, notes) and show the history in the territory panel.
- Updates appear live for all viewers without refreshing.
- Export a clean image of the current map to post in Discord.

**Non-goals**

- No combat resolution, dice, economy, AI or movement rules. Adjacency is data only.
- No contested, besieged or other intermediate states. A territory is held by exactly one faction.
- No region-capture bonus, crown or full-control highlight.
- No armies or tokens. No Essos.
- No player accounts. Players open a link and watch; the GM enters a shared passcode.

**Art and IP rule:** draw an original, stylized map and original simple heraldic glyphs. Do not trace or embed official maps, HBO artwork or official sigil artwork. This is a private fan project. Note that the hosted site is reachable by anyone with the URL (see section 8), so it uses an unlisted URL and `noindex`.

## 2. Tech stack and delivery

Static single-page web app on GitHub Pages (deployed by GitHub Actions) or Netlify, with a Supabase free-tier project for shared live state.

- **Language and build:** TypeScript, Vite. Use React or Svelte; pick one and keep dependencies small.
- **Rendering:** one inline SVG for the map, so every territory is a real DOM element with hover, focus, click and accessible labels.
- **Pan and zoom:** `d3-zoom` or a small custom handler. Mouse, trackpad and touch (pinch).
- **Build-time only:** `d3-delaunay` to subdivide regions (section 3). Not shipped to the browser.
- **Share link:** `lz-string` to compress a state snapshot into the URL hash.
- **Tests:** Vitest for the reducer, data validation, URL encode/decode and the occupied-state rule.
- **Fonts:** bundle a serif display face locally. No other runtime network calls except Supabase.
- **Targets:** latest Chrome, Safari, Firefox; desktop first, usable on a phone in landscape.
- **Live data:** `@supabase/supabase-js`. The public anon key may ship in the front end.
- **Repo layout:**

```text
/src
  /data        factions.json, regions.json, territories.json,
               territories.geo.json (generated, hand-editable SVG paths), scenarios/*.json
  /map         MapView, TerritoryShape, CastleIcon, Banner, layers
  /state       reducer, history (undo/redo), persistence, urlShare, sync
  /ui          Sidebar, TerritoryPanel, Scoreboard, Legend, GmToolbar, LogPanel, BattleForm
/scripts       generate-territories.mjs, validate-data.mjs, check-colors.mjs
/README.md     how to run, edit data, add a scenario, set up Supabase, deploy
```

`npm run dev` starts the app, `npm run build` outputs a static `dist/`, `npm run validate` checks data (section 7) and runs automatically as a `prebuild` step and in CI. `npm run check-colors` runs the color-blind check (section 4). Run `git init` in M0; commit at the end of each milestone.

## 3. Map and regions

Portrait SVG, `viewBox="0 0 1000 2000"`, north at top, the Wall about one-sixth of the way down. Coordinates are x west to east, y north to south. Positions are guidance; adjust where shapes look wrong. **The user approves a screenshot of the M1 map before M2 starts.**

**Visual style:** hand-drawn parchment look, but readable first. Muted blue-grey ocean, warm parchment land, thin coastline, subtle decorative rivers (Trident, Blackwater, Mander, Roseroad) and mountains that never block clicking. Territory borders thin; region borders thicker.

**The 11 regions**

| Region | Territories | Default holder |
| --- | --- | --- |
| Beyond the Wall | 3 | Free Folk |
| The Wall | 1 | Night's Watch |
| The North | 8 | Stark (Bolton holds the Dreadfort) |
| The Riverlands | 5 | Stark |
| The Vale | 4 | Unclaimed |
| The Westerlands | 4 | Lannister |
| The Iron Islands | 2 | Greyjoy |
| The Crownlands | 3 | Baratheon |
| The Reach | 6 | Tyrell |
| The Stormlands | 4 | Baratheon |
| Dorne | 4 | Martell |

**How to produce territory shapes (regions first)**

1. Define a simplified Westeros coastline, with islands (Bear Island, Iron Islands, Dragonstone, Tarth, the Arbor) as separate shapes.
2. Hand-define one polygon per region, following plausible features (the Neck, the Trident, the Red Mountains, the Mander). Regions partition the landmass with no gaps or overlaps.
3. Inside each region polygon, use that region's castle seeds (section 4) as `d3-delaunay` Voronoi sites and clip each cell to its own region polygon. A territory therefore belongs to exactly one region and a region's territories always tile its polygon.
4. **The Wall** is a hand-drawn thin strip across the width of the continent, not a Voronoi cell. Its adjacency is hand-set so Beyond the Wall touches only the Wall, and the Wall touches the North.
5. Island territories are single shapes with a dashed sea-link to their nearest mainland neighbor.
6. Write the result to `territories.geo.json` (SVG path data keyed by territory id; despite the name it is not lat/lon GeoJSON). It is committed and may be hand-edited. The build merges it into `Territory.path`.
7. Derive land adjacency from shared Voronoi edges, ignoring cells that touch only at a vertex (require a minimum shared edge length). Add sea links and the Wall adjacency by hand.

**Labels:** castle name on zoom-in; large, widely spaced region name that fades at high zoom. Labels use `pointer-events: none`.

## 4. Factions and castles

13 starting factions and 44 territories. Factions are data, not code: the GM can add, rename or recolor any faction. Tully and Arryn are not factions: the Riverlands start held by Stark and the Vale starts Unclaimed. The GM can add either as a faction later.

**Factions (default scenario: start of the War of the Five Kings)**

| ID | Faction | Suggested color | Glyph (original, simple) | Starts with |
| --- | --- | --- | --- | --- |
| stark | House Stark | #8FA3B0 slate grey | wolf head | North (7) + Riverlands (5) |
| lannister | House Lannister | #B3261E crimson | lion head | Westerlands (4) + King's Landing + Duskendale (6) |
| baratheon | House Baratheon | #E0B020 gold | stag head | Dragonstone only (1); this is Stannis's side |
| targaryen | House Targaryen | #6A1B4D plum | three-headed dragon | Nothing |
| greyjoy | House Greyjoy | #1E3A4C deep teal | kraken | Iron Islands (2) |
| tyrell | House Tyrell | #3E8E3E green | rose | The Reach (6) + the Stormlands (4) = 10; the Stormlands follow Renly |
| martell | House Martell | #E4731C orange | sun and spear | Dorne (4) |
| night-watch | Night's Watch | #2B2B2B near-black | crossed swords | The Wall (1) |
| free-folk | Free Folk | #A58B5B tan | horned skull | Beyond the Wall (3) |
| bolton | House Bolton | #F0B8C8 light pink | flayed man | The Dreadfort (1) |
| brotherhood | Brotherhood without Banners | #6B4A2B brown | flaming sword | Nothing |
| mercenaries | Neutrals (Mercenaries) | #7C7C3A olive | coin and dagger | Nothing |
| neutral | Unclaimed | parchment + diagonal hatch | none glyph | The Vale (4) |

Bolton is lightened from the first draft because dusty pink and Stark's slate grey had nearly equal luminance and sit side by side. `neutral` is a real faction in the data (so validation and holders work uniformly) but is excluded from the scoreboard, cannot be removed, and uses a built-in `none` glyph.

**Color rule (restated):** every pair of factions must be distinguishable using color, glyph and pattern together, not color alone. `npm run check-colors` simulates protanopia, deuteranopia and grayscale and reports every pair whose color difference falls below a threshold, so the GM can adjust. Colors are suggestions.

**Territories (seed points in the 1000 x 2000 map space)**

`Home` is the territory's home faction; `Holder` is who starts holding it. They differ only for the Dreadfort's carve-out, so only that is noted: Dreadfort home = bolton, holder = bolton. All other territories have home = starting holder, except the Vale, whose home and holder are both `neutral`.

| ID | Territory | Seat house | Region | Starts held by | x | y |
| --- | --- | --- | --- | --- | --- | --- |
| haunted-forest | Haunted Forest | Free Folk | Beyond the Wall | free-folk | 480 | 170 |
| frostfangs | The Frostfangs | Free Folk | Beyond the Wall | free-folk | 300 | 150 |
| hardhome | Hardhome | Free Folk | Beyond the Wall | free-folk | 760 | 190 |
| castle-black | Castle Black | Night's Watch | The Wall | night-watch | 520 | 330 |
| last-hearth | The Last Hearth | Umber | The North | stark | 560 | 420 |
| karhold | Karhold | Karstark | The North | stark | 740 | 450 |
| bear-island | Bear Island | Mormont | The North | stark | 300 | 400 |
| deepwood-motte | Deepwood Motte | Glover | The North | stark | 340 | 560 |
| winterfell | Winterfell | Stark | The North | stark | 500 | 560 |
| dreadfort | The Dreadfort | Bolton | The North | bolton | 680 | 620 |
| white-harbor | White Harbor | Manderly | The North | stark | 760 | 760 |
| moat-cailin | Moat Cailin and the Neck | Reed | The North | stark | 520 | 820 |
| the-twins | The Twins | Frey | The Riverlands | stark | 520 | 920 |
| seagard | Seagard | Mallister | The Riverlands | stark | 330 | 960 |
| riverrun | Riverrun | Tully | The Riverlands | stark | 440 | 1040 |
| harrenhal | Harrenhal | Whent (ruin) | The Riverlands | stark | 580 | 1100 |
| raventree-hall | Raventree Hall | Blackwood | The Riverlands | stark | 470 | 1150 |
| eyrie | The Eyrie | Arryn | The Vale | neutral | 740 | 990 |
| gulltown | Gulltown | Grafton | The Vale | neutral | 840 | 1060 |
| runestone | Runestone | Royce | The Vale | neutral | 680 | 1020 |
| the-fingers | The Fingers | Baelish | The Vale | neutral | 860 | 940 |
| casterly-rock | Casterly Rock | Lannister | The Westerlands | lannister | 170 | 1190 |
| golden-tooth | The Golden Tooth | Lefford | The Westerlands | lannister | 320 | 1120 |
| the-crag | The Crag | Westerling | The Westerlands | lannister | 190 | 1090 |
| ashemark | Ashemark | Marbrand | The Westerlands | lannister | 260 | 1260 |
| pyke | Pyke | Greyjoy | The Iron Islands | greyjoy | 130 | 960 |
| harlaw | Harlaw | Harlaw | The Iron Islands | greyjoy | 60 | 1010 |
| kings-landing | King's Landing | The Crown | The Crownlands | baratheon | 650 | 1250 |
| dragonstone | Dragonstone | Targaryen (historic) | The Crownlands | baratheon | 800 | 1210 |
| duskendale | Duskendale | Darklyn | The Crownlands | baratheon | 600 | 1180 |
| highgarden | Highgarden | Tyrell | The Reach | tyrell | 380 | 1380 |
| goldengrove | Goldengrove | Rowan | The Reach | tyrell | 470 | 1290 |
| horn-hill | Horn Hill | Tarly | The Reach | tyrell | 320 | 1480 |
| oldtown | Oldtown | Hightower | The Reach | tyrell | 170 | 1550 |
| the-arbor | The Arbor | Redwyne | The Reach | tyrell | 70 | 1650 |
| brightwater-keep | Brightwater Keep | Florent | The Reach | tyrell | 420 | 1560 |
| storms-end | Storm's End | Baratheon | The Stormlands | baratheon | 800 | 1400 |
| bronzegate | Bronzegate | Buckwell | The Stormlands | baratheon | 700 | 1330 |
| nightsong | Nightsong | Caron | The Stormlands | baratheon | 600 | 1500 |
| tarth | Tarth (Evenfall Hall) | Tarth | The Stormlands | baratheon | 920 | 1360 |
| yronwood | Yronwood | Yronwood | Dorne | martell | 640 | 1740 |
| sunspear | Sunspear | Martell | Dorne | martell | 880 | 1790 |
| starfall | Starfall | Dayne | Dorne | martell | 420 | 1840 |
| hellholt | Hellholt | Uller | Dorne | martell | 540 | 1840 |

**Tiers** (`city`, `fortress`, `castle`, `holdfast`) set castle icon size. Suggested: `city` for King's Landing, Oldtown, White Harbor; `fortress` for Casterly Rock, the Eyrie, Highgarden, Winterfell, Riverrun, Storm's End, Sunspear, Pyke; `holdfast` for Haunted Forest, Frostfangs, Hardhome and the Fingers (non-castle anchors); `castle` for the rest. Editable in the data file.

**Adjacency:** each territory lists neighbors, symmetric, including sea links (for example `pyke` to `seagard`, `harlaw` to `the-crag`, `bear-island` to `deepwood-motte`, `dragonstone` to `kings-landing`, `tarth` to `storms-end`, `the-arbor` to `oldtown`). Data only in v1; it drives the optional adjacency overlay and the clickable neighbor list.

## 5. Showing who controls what

Control is shown with redundant cues (fill color, banner glyph, ring) so the map reads in color-blind mode, in a small screenshot and in grayscale. Each territory has a **holder** and a **home faction**.

| State | When | Visual |
| --- | --- | --- |
| Controlled | Holder equals home faction | Fill tint in the holder's color; castle banner with the holder's glyph |
| Occupied | Holder is not the home faction, and holder is not `neutral` | Same fill and banner, plus a thin inner ring in the home faction's color |
| Unclaimed | Holder is `neutral` | Parchment fill with grey diagonal hatch; no ring, regardless of home faction |

Unclaimed takes precedence over Occupied, so a `blank` scenario shows no rings. There are no other states. Because Riverlands territories have home = Stark, a Riverlands territory captured by Lannister shows a Stark ring; this is intended.

**Always visible**

- A **castle icon** at each seed point, sized by tier, topped by a small **banner** in the holder's color with the holder's glyph.
- A **color tint** at about 60 percent opacity over each territory so the parchment still shows through.
- **Region borders** thicker than territory borders, and a one-line **region caption** with a holder summary, for example `The Reach: Tyrell 6/6` or `The North: Stark 7, Bolton 1`.

The ring width is in screen pixels (use `vector-effect: non-scaling-stroke` and clipping) so it stays legible when zoomed.

**Accessibility:** a toggle for a color-blind-safe palette (`altColor`) and a high-contrast mode. Faction names are in tooltips and `aria-label`s.

## 6. UI and interaction

The map fills about 75 percent of the width, with a collapsible sidebar on the right and a slim top bar. Two modes: **View** (default, read-only) and **GM** (edit), switched in the top bar. Entering GM mode asks for the passcode (section 8). Share links, exports and the default URL open in View mode.

**Map interactions (both modes)**

- Pan by dragging, zoom by wheel or pinch, a "fit all" button. A drag that ends over a territory must not count as a click. Double-click zoom is disabled (it conflicts with click-to-select and paint mode); use a "zoom to territory" button in the panel and in search results instead.
- Hover: highlight and tooltip (castle, seat house, region, holder, occupied note). On touch, tap selects and shows the tooltip content in the panel.
- Click: select and open the territory panel.
- Search box: castle, house or region name; jump and flash.
- Layer toggles: region borders, region captions, castle labels, rivers and mountains, adjacency lines.
- Click a faction in the legend to dim everything it does not hold.

**Sidebar panels**

1. **Scoreboard:** one row per faction (excluding Unclaimed) with swatch, glyph and territories held, sorted by count. Shows the Unclaimed count separately.
2. **Legend:** factions plus the three state visuals.
3. **Territory panel:** name, seat house, region, holder, home faction, tier, state, clickable neighbors, free-text notes, and a **Battles** section (below). In GM mode the holder is a dropdown and notes are editable.
4. **Log:** reverse-chronological list of changes, for example `Turn 7: Casterly Rock Lannister to Stark`, each with an optional GM note.

**Battle history**

- **Record a battle (GM):** pick the territory, attacker faction, defender faction, the **players who fought** on each side, the outcome (captured, repelled, draw) and an optional **free-text note**. Outcome "captured" proposes changing the holder to the attacker in the same action; the GM confirms.
- **Territory panel, Battles section:** every battle there, newest first (turn, attacker vs defender, players, outcome, note), plus "fought N times" and "changed hands M times".
- **Live feed:** viewers see a toast such as "Turn 7: Casterly Rock captured by Stark" when the GM saves.
- Out of scope: a full History page, filters, CSV and heat layer.

**GM toolbar (GM mode only)**

- **Paint mode:** pick a faction, then click territories to assign them. Esc exits.
- **Turn counter:** increment, decrement, and a season or round label; changes are logged.
- **Undo and redo:** Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z. Undo reverts the last action and appends an "undo" entry to the log (the log is never rewritten). Undoing a recorded battle also removes that battle record, since stats are derived from the list.
- **Faction manager:** add, rename, recolor, remove. Removing a faction that still holds territories requires choosing who receives them; if the removed faction is the home faction of any territory, the GM chooses a replacement home too. Past log and battle entries keep the removed faction's name as text.
- **Scenario menu:** load a scenario, reset to the default, or download the current state as a scenario file (a static site cannot save it; commit the downloaded file to the repo to keep it).

**Export:** a one-click **Export image** renders the map, legend, scoreboard and turn caption into one PNG sized for Discord. Inline the bundled fonts and styles into the SVG before rasterizing, otherwise labels fall back to system fonts.

## 7. Data model

Static data (factions, regions, territories) lives in JSON files separate from mutable game state. All state changes go through one reducer; every action is logged and undoable.

```typescript
type FactionId = string;
type TerritoryId = string;
type RegionId = string;

interface Faction {
  id: FactionId;
  name: string;
  color: string;           // hex; for "neutral" this is the parchment base
  altColor?: string;       // color-blind-safe override
  glyph: string;           // id of an original SVG glyph; "none" is built in
  isPlayer: boolean;
  playerName?: string;
}

interface Region {
  id: RegionId;
  name: string;
  labelPos: [number, number];
}

interface Territory {
  id: TerritoryId;
  name: string;
  seatHouse: string;
  region: RegionId;
  homeFaction: FactionId;  // may be "neutral" (the Vale)
  tier: "city" | "fortress" | "castle" | "holdfast";
  seat: [number, number];
  path: string;            // merged from territories.geo.json
  adjacent: TerritoryId[]; // land and sea links, symmetric
}

interface TerritoryState {
  holder: FactionId;
  note?: string;
}

interface LogEntry {
  id: string;
  turn: number;
  timestamp: string;       // ISO 8601
  territory?: TerritoryId;
  action: string;          // "holder-changed", "battle-recorded", "undo", ...
  from?: string;
  to?: string;
  note?: string;
}

interface Battle {
  id: string;
  turn: number;
  timestamp: string;
  territory: TerritoryId;
  attacker: { faction: FactionId; players: string[] };
  defender: { faction: FactionId; players: string[] };
  outcome: "captured" | "repelled" | "draw";
  holderBefore: FactionId;
  holderAfter: FactionId;  // equals holderBefore unless captured
  note?: string;
}

interface GameState {
  version: 1;
  scenarioId: string;
  turn: number;
  turnLabel?: string;      // e.g. "Autumn 299 AC"
  territories: Record<TerritoryId, TerritoryState>;
  factions: Faction[];     // state copy so GM edits persist
  log: LogEntry[];
  battles: Battle[];       // the only store of battles
}

// Derived, never stored:
//   timesFought(territory)       = battles on that territory
//   timesChangedHands(territory) = battles there with outcome "captured"
//   isOccupied(territory)        = holder != homeFaction && holder != "neutral"
```

There is no separate battles table: battles live only in `GameState.battles`, so undo and sync stay simple. Player names are free text entered per battle; the form should offer previously used names as suggestions to limit typos.

**Scenario files** (`src/data/scenarios/*.json`) contain only starting `territories` holders, `factions` and `turn`. Ship `war-of-five-kings.json` (section 4) and `blank.json` (everything `neutral`).

**Validation (`npm run validate`)** fails the build if any of these is false:

- Territory ids are unique; every territory's region, home faction and every `adjacent` id exists; no self-adjacency; `tier` is a valid value.
- Adjacency is symmetric and the graph is connected.
- Every region has at least one territory; no territory is in two regions.
- Every territory has a path in `territories.geo.json`, and every path has a territory.
- Every scenario assigns a holder to every territory and every holder exists.
- Every faction has a unique id, a valid hex color and an existing glyph (the built-in `none` counts).

## 8. Persistence, live sync and sharing

**Source of truth:** the Supabase row. `localStorage` is only an offline cache and the GM's unsent draft, never overriding a newer server revision.

- **Live sync (M5):** a Supabase free-tier project with one table, `campaign_state` (one row per campaign: `GameState` JSON plus an integer `revision`). Viewers read and subscribe through realtime with the anon key. Row-level security blocks direct writes. The GM writes through one database function that takes the passcode, the new state and the expected revision; it rejects a wrong passcode or a stale revision (so two GM tabs cannot overwrite each other silently). Target: a change appears for viewers within about 2 seconds.
- **Passcode (deliberately simple):** the passcode is **hard-coded as `password234`** by the owner's decision, in both the front end and the database function. This is a friends' game, so it only stops casual edits: anyone who reads the page's JavaScript can find it. Say this in the README and note how to change it (two places).
- **Offline:** if the backend is unreachable, show the last cached state with an offline banner and disable GM writes.
- **Free-tier pausing:** Supabase pauses idle free projects. The README explains how to wake one and offers an optional scheduled keep-alive ping via GitHub Actions (GitHub disables scheduled workflows after 60 days without repo activity; mention this).
- **Privacy:** the site is public if someone has the URL. Use an unlisted URL, add `noindex` meta and robots rules, and do not link it publicly.
- **Autosave (M2 onward, before sync exists):** write `GameState` to `localStorage` after every change, with a schema version. An unknown version offers a backup load and never crashes.
- **JSON export and import:** download as `westeros-turn-<n>.json` and import with schema validation and a readable error list.
- **Share link:** `lz-string` snapshot of holders, turn and faction edits (omit log and battles) in the URL hash. Opening it shows a frozen snapshot in View mode with a "Snapshot from turn N" banner and live sync off. If the link would exceed about 8,000 characters, offer the JSON file instead and say so.
- **Image and print:** PNG at 2x and SVG export; a print stylesheet that fits the map on one page.
- **Reset:** a confirmed "reset to scenario" that downloads a backup JSON first.

## 9. Milestones and acceptance criteria

Build in order, commit (`git init` first) at the end of each milestone, and run the app after each to check the criteria and summarize what changed. GM mode in M2 to M4 is local-only; the passcode check arrives in M5.

1. **M0, scaffold and data.** Vite + TypeScript, JSON data for 13 factions, 11 regions and 44 territories, placeholder glyphs, `validate-data.mjs`, `check-colors.mjs`, README skeleton, `git init`.
2. **M1, static map.** Coastline, region polygons, Voronoi territories, the Wall strip, region borders, castle icons, labels, pan and zoom, tooltips, region captions. **Stop for the user's screenshot approval before M2.**
3. **M2, control and state.** Holder fills, banners, occupied ring, unclaimed hatch, reducer, autosave, GM mode with holder dropdown, paint mode, scoreboard, legend.
4. **M3, GM tools and sharing.** Undo and redo, log, turn counter, faction manager, scenario menu, JSON import and export, share link, PNG and SVG export.
5. **M4, battles and polish.** Battle form and the territory panel Battles section, adjacency overlay, color-blind palette, high-contrast mode, print stylesheet, mobile landscape pass, final glyphs.
6. **M5, hosting and live sync.** Supabase project, realtime subscription, passcode-checked write function with revision check, offline banner, toasts, README setup, deploy to GitHub Pages or Netlify. If M4 runs long, do M5 first: live updates matter more than polish.

**Acceptance criteria**

- [ ] All 44 territories are visible, clickable and named, and each belongs to exactly one of the 11 regions.
- [ ] A first-time viewer can tell who controls any territory within 2 seconds, without opening a panel.
- [ ] In paint mode, assigning a holder takes two clicks for the first territory (pick faction, click territory) and one for each after; the map, scoreboard and region captions update immediately.
- [ ] An occupied territory is visibly different from one held by its home faction; unclaimed territories show no ring.
- [ ] A refresh or closing the tab loses nothing; undo reverses the last change and the log shows it.
- [ ] Recording a battle adds it to that territory's list and updates its fought and changed-hands counts; a capture can change the holder.
- [ ] Export image produces a legible PNG with the legend, scoreboard and turn number.
- [ ] A share link opens on another device and shows the same snapshot in View mode.
- [ ] The map stays smooth (about 60 fps) while panning and zooming on a mid-range laptop.
- [ ] Every faction pair is distinguishable by color, glyph and pattern together, per `npm run check-colors`.
- [ ] `npm run validate` and `npm test` pass; `npm run build` produces a deployable `dist/`.
- [ ] The README explains how to run, edit factions and scenarios, set up Supabase, change the passcode and deploy.
- [ ] Viewers see a GM change within about 2 seconds without refreshing.
- [ ] The site runs on GitHub Pages or Netlify with the database on a free tier, at zero cost.
- [ ] Without the passcode, the server rejects writes, and a stale-revision write is rejected.

**Working agreements for Claude Code:** if a point here is ambiguous, pick the simplest option and note the assumption in the README rather than stopping; keep data files human-editable and well commented; do not add features outside this spec without asking. The one exception to "stop and ask" is the M1 screenshot checkpoint, which is required.

## 10. Decisions log and future extensions

**Decided with the owner (Nov 24, 2026)**

- The tracker has no contested, besieged or similar states, and no crown or full-control highlight.
- Units are the 44 territories. Home factions: Riverlands = Stark, Vale = neutral, Dreadfort = Bolton, all others = starting holder. The Stark ring on Riverlands is intended.
- Battles are one list inside the game state with player names and a free-text note.
- The passcode is hard-coded as `password234`.
- The site is unlisted with `noindex`.
- Shapes are built regions first.
- The color-blind rule is color plus glyph plus pattern.

**Still open (not blocking M0 to M3)**

- Which factions are player-controlled, and whether minor houses such as Frey or Karstark become separate player factions (add them as data; no code change).
- Whether supplies, ports or garrisons should become map data later (add a `resources` field to `Territory`).

**Future extensions:** a full battle History page with filters and CSV, a heat layer for most-fought territories, a timeline scrubber replaying the log, alternate eras as scenarios, army tokens, a stronger passcode (hashed, server-checked), a rules-driven turn engine.
