export const BUS_TRIGGER_WALK_MIN: number;
export const BUS_STOP_SEARCH_RADIUS_M: number;
export const MAX_NEARBY_BUS_STOPS: number;
export const BUS_SPEED_KMH: number;
export const BUS_DWELL_MIN_PER_STOP: number;
export const BUS_DEFAULT_HEADWAY_MIN: number;
export const BUS_MIN_WAIT_MIN: number;
export const BUS_MAX_WAIT_MIN: number;
export const BUS_MIN_SAVING_MIN: number;
export const BUS_STATION_SEARCH_RADIUS_M: number;
export const MAX_BUS_STATION_CANDIDATES: number;
export const MAX_NEARBY_STATIONS: number;
export const WALK_SELECTION_WEIGHT: number;
export const MAX_RESIDENTIAL_PROFILES_PER_DONG: number;
export const RESIDENTIAL_WEIGHT_SCALE: number;

export function buildResidentialAccess(
  population: unknown,
  graph: unknown,
  network: unknown,
  options?: {
    generatedAt?: string;
    percentile?: number;
    maxProfilesPerDong?: number;
    weightScale?: number;
    aggregateProfiles?: boolean;
  },
): {
  residential: import("../../src/types").ResidentialAccess;
  stats: Record<string, number>;
};
