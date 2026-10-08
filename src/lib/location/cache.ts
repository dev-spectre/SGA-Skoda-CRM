import { prisma } from '../prisma';
import type { BranchCandidate } from './routing';
import type { TieredLocationResult } from './geocoder';

// ==========================================
// 1. In-Memory Active Branches Cache
// ==========================================

interface CachedBranches {
  branches: BranchCandidate[];
  cachedAt: number;
}

let branchesCache: CachedBranches | null = null;
const BRANCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Invalidates the in-memory active branches cache so the next call
 * fetches fresh branch definitions from the database.
 */
export function invalidateBranchCache(): void {
  branchesCache = null;
}

/**
 * Returns the list of active branches with valid GPS coordinates.
 * Served from fast in-memory cache (< 0.001ms), refreshed if expired.
 */
export async function getActiveBranchesCached(): Promise<BranchCandidate[]> {
  const now = Date.now();
  if (branchesCache && now - branchesCache.cachedAt < BRANCH_CACHE_TTL_MS) {
    return branchesCache.branches;
  }

  try {
    const dbBranches = await prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        latitude: true,
        longitude: true,
        radiusKm: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    const validBranches: BranchCandidate[] = dbBranches
      .filter(
        (b: any) =>
          typeof b.latitude === 'number' &&
          typeof b.longitude === 'number' &&
          !(b.latitude === 0 && b.longitude === 0)
      )
      .map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        city: b.city,
        latitude: b.latitude as number,
        longitude: b.longitude as number,
        radiusKm: b.radiusKm ?? 50.0,
        isActive: b.isActive,
      }))
      .sort((a: any, b: any) => {
        const aIsSing = a.name.toLowerCase().includes('singanallur');
        const bIsSing = b.name.toLowerCase().includes('singanallur');
        if (aIsSing && !bIsSing) return -1;
        if (!aIsSing && bIsSing) return 1;
        return a.name.localeCompare(b.name);
      });

    branchesCache = {
      branches: validBranches,
      cachedAt: now,
    };

    return validBranches;
  } catch (err) {
    console.error('Failed to load active branches into cache:', err);
    return branchesCache?.branches ?? [];
  }
}

// ==========================================
// 2. In-Memory Geocoded Locations Cache
// ==========================================
// 2. In-Memory Geocoded Locations Cache
// ==========================================

export type { CachedLocationData } from './cache-store';
export { getCachedLocationFromMemory, getAllCachedLocationsFromMemory } from './cache-store';
import { CachedLocationData, setCachedLocationMemory } from './cache-store';

let isLocationCacheLoaded = false;
let locationCacheLoadPromise: Promise<void> | null = null;

/**
 * Pre-populates the in-memory location cache from PostgreSQL LocationCache table.
 * Runs once on first access.
 */
export async function ensureLocationCacheLoaded(): Promise<void> {
  if (isLocationCacheLoaded) return;
  if (locationCacheLoadPromise) return locationCacheLoadPromise;

  locationCacheLoadPromise = (async () => {
    try {
      const rows = await prisma.locationCache.findMany({
        select: {
          searchTerm: true,
          canonicalName: true,
          district: true,
          state: true,
          latitude: true,
          longitude: true,
          source: true,
        },
      });

      for (const row of rows) {
        if (!row.searchTerm) continue;
        const key = row.searchTerm.toLowerCase().trim();
        const s = (row.state || '').toLowerCase();
        const isTN = s
          ? (s.includes('tamil nadu') || s.includes('tamilnadu') || s.includes('puducherry') || s.includes('pondicherry'))
          : (row.latitude >= 8.08 &&
              row.latitude <= 13.55 &&
              row.longitude >= 76.23 &&
              row.longitude <= 80.35);

        setCachedLocationMemory(key, {
          canonicalName: row.canonicalName,
          district: row.district,
          state: row.state,
          latitude: row.latitude,
          longitude: row.longitude,
          source: row.source || 'cache',
          isTamilNadu: isTN,
        });
      }

      isLocationCacheLoaded = true;
    } catch (err) {
      console.warn('Failed to pre-load LocationCache into memory:', err);
    } finally {
      locationCacheLoadPromise = null;
    }
  })();

  return locationCacheLoadPromise;
}

/**
 * Saves a resolved location to in-memory cache and asynchronously persists to DB.
 */
export async function setCachedLocation(
  key: string,
  data: CachedLocationData
): Promise<void> {
  if (!key) return;
  const cleanKey = key.toLowerCase().trim();
  setCachedLocationMemory(cleanKey, data);

  // Persist to database asynchronously without blocking caller
  prisma.locationCache
    .upsert({
      where: { searchTerm: cleanKey },
      update: {
        canonicalName: data.canonicalName,
        district: data.district,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
        source: data.source,
      },
      create: {
        searchTerm: cleanKey,
        canonicalName: data.canonicalName,
        district: data.district,
        state: data.state,
        latitude: data.latitude,
        longitude: data.longitude,
        source: data.source,
      },
    })
    .catch((err: any) => {
      console.warn('Asynchronous LocationCache persist warning:', err?.message || err);
    });
}
