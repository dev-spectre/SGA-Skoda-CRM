export interface CachedLocationData {
  canonicalName: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  source: string;
  isTamilNadu: boolean;
}

const locationMemoryMap = new Map<string, CachedLocationData>();

/**
 * Instant in-memory lookup for a normalized search key (< 0.001ms).
 * Safe to call in both client and server environments.
 */
export function getCachedLocationFromMemory(key: string): CachedLocationData | null {
  if (!key) return null;
  return locationMemoryMap.get(key.toLowerCase().trim()) ?? null;
}

/**
 * Returns all cached entries currently in memory for fuzzy matching.
 */
export function getAllCachedLocationsFromMemory(): Map<string, CachedLocationData> {
  return locationMemoryMap;
}

/**
 * Updates the in-memory map entry.
 */
export function setCachedLocationMemory(key: string, data: CachedLocationData): void {
  if (!key) return;
  locationMemoryMap.set(key.toLowerCase().trim(), data);
}
