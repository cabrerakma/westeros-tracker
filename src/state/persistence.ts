import type { GameState } from "../types";

/**
 * Nothing is kept in local storage. The shared map is public/campaign.json (see campaign.ts); the GM
 * edits in memory and downloads a new campaign.json to publish it (replace the file in the repo, commit).
 */
function download(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The file to publish: always named campaign.json, so it can be dropped straight into the repo. */
export function downloadCampaign(state: GameState): void {
  download(JSON.stringify(state, null, 2) + "\n", "campaign.json");
}

/** A timestamped copy (used as the backup before a reset). */
export function downloadBackup(state: GameState, label = "westeros-backup"): void {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  download(JSON.stringify(state, null, 2) + "\n", `${label}-${stamp}.json`);
}
