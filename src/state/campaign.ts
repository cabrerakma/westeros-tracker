import type { GameState } from "../types";
import { normalizeState } from "./game";

/** Stable text form of a state, to tell whether two copies of the map are the same. */
export const stateKey = (s: GameState): string => JSON.stringify(s);

/** Where the published map is. The query string defeats browser and CDN caches after a new publish. */
export const campaignUrl = (): string => new URL("campaign.json", document.baseURI).toString() + `?t=${Date.now()}`;

/** Load the published map (public/campaign.json). Throws if it is missing or not a valid map file. */
export async function loadCampaign(url: string = campaignUrl()): Promise<GameState> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`campaign.json could not be loaded (HTTP ${res.status})`);
  const state = normalizeState(await res.json());
  if (!state) throw new Error("campaign.json is not a valid Westeros map file");
  return state;
}
