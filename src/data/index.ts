import type { Faction, Region, Scenario, Territory } from "../types";
import factions from "./factions.json";
import regions from "./regions.json";
import territories from "./territories.json";
import warOfFiveKings from "./scenarios/war-of-five-kings.json";
import blank from "./scenarios/blank.json";

export const FACTIONS = factions as Faction[];
export const REGIONS = regions as Region[];
export const TERRITORIES = territories as Territory[];
export const SCENARIOS: Record<string, Scenario> = {
  "war-of-five-kings": warOfFiveKings as Scenario,
  blank: blank as Scenario,
};
export const DEFAULT_SCENARIO_ID = "war-of-five-kings";
