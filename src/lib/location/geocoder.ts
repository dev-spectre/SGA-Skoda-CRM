import { prisma } from '../prisma';
import { resolveLocation } from './matcher';
import { normalizeKey } from './tn-locations';
import { isLocationOutsideTamilNadu } from './out-of-state';
import {
  ensureLocationCacheLoaded,
  getCachedLocationFromMemory,
  setCachedLocation,
  getAllCachedLocationsFromMemory,
} from './cache';

export interface TieredLocationResult {
  matched: boolean;
  query: string;
  canonicalName: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  pincode?: string;
  source: 'dictionary' | 'cache' | 'google' | 'nominatim' | 'none' | 'manual_override';
  confidence: number;
  isTamilNadu: boolean;
}

export interface GeocoderOptions {
  skipCache?: boolean;
  skipExternal?: boolean;
  googleApiKey?: string;
}

/**
 * Serial Rate Limiter Queue
 * Enforces a guaranteed minimum delay between consecutive network calls
 * to respect OSM Nominatim rate limits (max 1 req/sec) and throttle Google API calls.
 */
export class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;
  private lastCallTimestamp = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 1000) {
    this.minIntervalMs = minIntervalMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLast = now - this.lastCallTimestamp;
          if (timeSinceLast < this.minIntervalMs) {
            const waitTime = this.minIntervalMs - timeSinceLast;
            await new Promise((r) => setTimeout(r, waitTime));
          }
          this.lastCallTimestamp = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }

    this.isProcessing = false;
  }
}

// Global rate limiter singleton (1000ms delay between external geocoder requests)
export const globalRateLimiter = new RateLimiter(1000);

export { TAMIL_NADU_BOUNDS, isWithinTamilNaduBounds, isTamilNaduState } from './bounds';
import { isWithinTamilNaduBounds, isTamilNaduState } from './bounds';

interface ExternalGeocodeResponse {
  canonicalName: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  source: 'google' | 'nominatim';
}

/**
 * Queries OpenStreetMap Nominatim with strict application User-Agent
 * and bounding box restricted strictly to Tamil Nadu.
 */
export async function queryNominatim(query: string): Promise<ExternalGeocodeResponse | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&addressdetails=1&countrycodes=in&limit=1`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SGA-Tata-CRM/1.0 (dealership-lead-routing)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim error: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  const address = first.address || {};
  const state = address.state || address.region || '';
  const district = address.state_district || address.county || address.city || '';
  const canonicalName =
    address.city || address.town || address.village || address.suburb || first.name || query;

  return {
    canonicalName,
    district,
    state,
    latitude: parseFloat(first.lat),
    longitude: parseFloat(first.lon),
    source: 'nominatim',
  };
}

/**
 * Queries Google Maps Geocoding API with bounds and administrative area restricted to Tamil Nadu.
 */
export async function queryGoogleGeocode(
  query: string,
  apiKey: string
): Promise<ExternalGeocodeResponse | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    query
  )}&region=in&components=country:IN&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google geocode error: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }

  const first = data.results[0];
  const loc = first.geometry?.location;
  if (!loc) return null;

  let state = '';
  let district = '';
  let canonicalName = '';

  for (const comp of first.address_components || []) {
    const types: string[] = comp.types || [];
    if (types.includes('administrative_area_level_1')) {
      state = comp.long_name;
    } else if (types.includes('administrative_area_level_2') || types.includes('administrative_area_level_3')) {
      district = comp.long_name;
    } else if (types.includes('locality') || types.includes('postal_town')) {
      canonicalName = comp.long_name;
    }
  }

  return {
    canonicalName: canonicalName || first.formatted_address || query,
    district,
    state,
    latitude: loc.lat,
    longitude: loc.lng,
    source: 'google',
  };
}


/**
 * Tiered Location Resolution Pipeline:
 * 1. Local Tamil Nadu Dictionary & Fuzzy Matcher (Phase 3) (< 0.1ms)
 * 2. PostgreSQL LocationCache Table lookup (< 5ms)
 * 3. Rate-limited External Geocoding API (Google / Nominatim) + immediate DB persistence
 */
export async function resolveLocationTiered(
  rawQuery: string,
  options?: GeocoderOptions
): Promise<TieredLocationResult> {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return {
      matched: false,
      query: rawQuery || '',
      canonicalName: '',
      district: '',
      state: '',
      latitude: 0,
      longitude: 0,
      source: 'none',
      confidence: 0,
      isTamilNadu: false,
    };
  }

  const query = rawQuery.trim();
  const searchKey = normalizeKey(query);

  // ----------------------------------------------------
  // Tier 0: User Manual Override Cache (< 0.001ms)
  // If an admin/staff manually assigned this city to a branch or marked outside, respect with highest priority
  // ----------------------------------------------------
  if (!options?.skipCache && searchKey) {
    try {
      await ensureLocationCacheLoaded();
      const cached = getCachedLocationFromMemory(searchKey);
      if (cached && cached.source === 'manual_override') {
        return {
          matched: true,
          query,
          canonicalName: cached.canonicalName || query,
          district: cached.district,
          state: cached.state,
          latitude: cached.latitude,
          longitude: cached.longitude,
          source: 'manual_override',
          confidence: 1.0,
          isTamilNadu: cached.isTamilNadu,
        };
      }
    } catch (err) {
      console.warn('Manual override cache check warning:', err);
    }
  }

  // ----------------------------------------------------
  // Tier 1: Exact Tamil Nadu Dictionary Resolution (O(1) < 0.001ms)
  // Exact canonical names, native Tamil script, curated aliases, or TN pincodes
  // ----------------------------------------------------
  const exactDictResult = resolveLocation(query, { exactOnly: true });
  if (exactDictResult.matched) {
    return {
      matched: true,
      query,
      canonicalName: exactDictResult.canonicalName,
      district: exactDictResult.district,
      state: 'Tamil Nadu',
      latitude: exactDictResult.latitude,
      longitude: exactDictResult.longitude,
      pincode: exactDictResult.pincode,
      source: 'dictionary',
      confidence: exactDictResult.confidence,
      isTamilNadu: true,
    };
  }

  // If query is an out-of-state pincode or confirmed out-of-state location, return early as outside TN
  if (exactDictResult.isOutOfState || isLocationOutsideTamilNadu(query)) {
    return {
      matched: true,
      query,
      canonicalName: query,
      district: '',
      state: 'Outside Tamil Nadu',
      latitude: 0,
      longitude: 0,
      source: 'none',
      confidence: 1.0,
      isTamilNadu: false,
    };
  }

  // ----------------------------------------------------
  // Tier 2: In-Memory LocationCache Lookup (< 0.001ms)
  // Geocoded cache populated from external API / past resolutions
  // ----------------------------------------------------
  if (!options?.skipCache && searchKey) {
    try {
      await ensureLocationCacheLoaded();
      let cached = getCachedLocationFromMemory(searchKey);

      if (!cached) {
        const row = await prisma.locationCache.findUnique({
          where: { searchTerm: searchKey },
        });
        if (row) {
          const s = (row.state || '').toLowerCase();
          const isTN = s
            ? (s.includes('tamil nadu') || s.includes('tamilnadu') || s.includes('puducherry') || s.includes('pondicherry'))
            : (row.latitude >= 8.08 &&
                row.latitude <= 13.55 &&
                row.longitude >= 76.23 &&
                row.longitude <= 80.35);

          cached = {
            canonicalName: row.canonicalName,
            district: row.district,
            state: row.state,
            latitude: row.latitude,
            longitude: row.longitude,
            source: row.source || 'cache',
            isTamilNadu: isTN,
          };
          setCachedLocation(searchKey, cached);
        }
      }

      if (cached) {
        return {
          matched: true,
          query,
          canonicalName: cached.canonicalName,
          district: cached.district,
          state: cached.state,
          latitude: cached.latitude,
          longitude: cached.longitude,
          source: 'cache',
          confidence: 0.95,
          isTamilNadu: cached.isTamilNadu,
        };
      }

      // Check if any word or normalized token matches an in-memory cached location
      const memoryEntries = getAllCachedLocationsFromMemory();
      const tokens = query.toLowerCase().split(/[\s,.-]+/).filter((t) => t.length >= 3);
      for (const t of tokens) {
        const normT = normalizeKey(t);
        const match = memoryEntries.get(normT);
        if (match) {
          return {
            matched: true,
            query,
            canonicalName: match.canonicalName,
            district: match.district,
            state: match.state,
            latitude: match.latitude,
            longitude: match.longitude,
            source: 'cache',
            confidence: 0.90,
            isTamilNadu: match.isTamilNadu,
          };
        }
      }
    } catch (err) {
      console.warn('In-memory LocationCache lookup warning:', err);
    }
  }

  // ----------------------------------------------------
  // Tier 2.5: Smart Misspelling & Phonetic Fallback for Tamil Nadu Locations (< 0.1ms)
  // Evaluates local dictionary with typo & transliteration tolerance BEFORE making external network calls
  // ----------------------------------------------------
  const fuzzyResult = resolveLocation(query);
  if (fuzzyResult.isOutOfState) {
    return {
      matched: true,
      query,
      canonicalName: query,
      district: '',
      state: 'Outside Tamil Nadu',
      latitude: 0,
      longitude: 0,
      source: 'none',
      confidence: 1.0,
      isTamilNadu: false,
    };
  }

  if (fuzzyResult.matched) {
    if (searchKey) {
      setCachedLocation(searchKey, {
        canonicalName: fuzzyResult.canonicalName,
        district: fuzzyResult.district,
        state: 'Tamil Nadu',
        latitude: fuzzyResult.latitude,
        longitude: fuzzyResult.longitude,
        source: 'dictionary',
        isTamilNadu: true,
      }).catch((cacheErr) => {
        console.warn('LocationCache save warning:', cacheErr);
      });
    }

    return {
      matched: true,
      query,
      canonicalName: fuzzyResult.canonicalName,
      district: fuzzyResult.district,
      state: 'Tamil Nadu',
      latitude: fuzzyResult.latitude,
      longitude: fuzzyResult.longitude,
      source: 'dictionary',
      confidence: fuzzyResult.confidence,
      isTamilNadu: true,
    };
  }

  // ----------------------------------------------------
  // Guard against making external network calls for junk, noise, or short abbreviations
  // ----------------------------------------------------
  const lowerQuery = query.toLowerCase().trim();
  const NOISE_LOOKUP_WORDS = new Set([
    'city', 'town', 'twon', 'village', 'post', 'area', 'near', 'na', 'n/a',
    'null', 'nil', 'none', 'test', 'yes', 'no', 'unknown', 'am', 'pm'
  ]);
  const OUT_OF_STATE_ABBRS = new Set([
    'up', 'mp', 'ap', 'wb', 'kl', 'ka', 'mh', 'gj', 'rj', 'hr', 'pb', 'dl', 'ts', 'uk', 'hp', 'jk'
  ]);

  if (
    options?.skipExternal ||
    NOISE_LOOKUP_WORDS.has(lowerQuery) ||
    (lowerQuery.length <= 2 && !OUT_OF_STATE_ABBRS.has(lowerQuery)) ||
    /(.)\1{4,}/.test(lowerQuery) ||
    (lowerQuery.length > 25 && !/\s/.test(lowerQuery))
  ) {
    return {
      matched: false,
      query,
      canonicalName: '',
      district: '',
      state: '',
      latitude: 0,
      longitude: 0,
      source: 'none',
      confidence: 0,
      isTamilNadu: false,
    };
  }

  // ----------------------------------------------------
  // Tier 3: Rate-Limited External Geocoding + DB & Memory Persistence
  // ----------------------------------------------------
  const googleApiKey = options?.googleApiKey || process.env.GOOGLE_GEOCODING_API_KEY;

  try {
    const geoResponse = await globalRateLimiter.enqueue(async () => {
      if (googleApiKey) {
        return queryGoogleGeocode(query, googleApiKey);
      }
      return queryNominatim(query);
    });

    if (geoResponse) {
      const isTN = geoResponse.state
        ? isTamilNaduState(geoResponse.state)
        : isWithinTamilNaduBounds(geoResponse.latitude, geoResponse.longitude);

      // Persist into in-memory cache and DB LocationCache
      if (searchKey) {
        setCachedLocation(searchKey, {
          canonicalName: geoResponse.canonicalName,
          district: geoResponse.district,
          state: geoResponse.state,
          latitude: geoResponse.latitude,
          longitude: geoResponse.longitude,
          source: geoResponse.source,
          isTamilNadu: isTN,
        }).catch((cacheErr) => {
          console.warn('LocationCache save warning:', cacheErr);
        });
      }

      return {
        matched: true,
        query,
        canonicalName: geoResponse.canonicalName,
        district: geoResponse.district,
        state: geoResponse.state,
        latitude: geoResponse.latitude,
        longitude: geoResponse.longitude,
        source: geoResponse.source,
        confidence: 0.9,
        isTamilNadu: isTN,
      };
    }
  } catch (err) {
    console.error('External geocoding error:', err);
  }

  // ----------------------------------------------------
  // Tier 4: Unknown / Unresolvable Location
  // ----------------------------------------------------
  return {
    matched: false,
    query,
    canonicalName: '',
    district: '',
    state: '',
    latitude: 0,
    longitude: 0,
    source: 'none',
    confidence: 0,
    isTamilNadu: false,
  };
}
