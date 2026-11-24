import { afterEach, describe, expect, it, vi } from "vitest";
import published from "../../public/campaign.json?raw";
import { loadCampaign, stateKey } from "./campaign";
import { initialState, normalizeState } from "./game";

afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown, ok = true, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status, json: async () => body })));

describe("loadCampaign", () => {
  it("loads and validates a published map", async () => {
    respond(JSON.parse(JSON.stringify(initialState())));
    const s = await loadCampaign("http://x/campaign.json");
    expect(stateKey(s)).toBe(stateKey(initialState()));
  });
  it("rejects a missing file", async () => {
    respond({}, false, 404);
    await expect(loadCampaign("http://x/campaign.json")).rejects.toThrow(/HTTP 404/);
  });
  it("rejects a file that is not a map", async () => {
    respond({ hello: "world" });
    await expect(loadCampaign("http://x/campaign.json")).rejects.toThrow(/not a valid/);
  });
});

describe("the published public/campaign.json", () => {
  it("is a valid map for the current territories", () => {
    const raw = JSON.parse(published);
    const s = normalizeState(raw);
    expect(s).not.toBeNull();
    expect(Object.keys(raw.territories).sort()).toEqual(Object.keys(initialState().territories).sort());
  });
});
