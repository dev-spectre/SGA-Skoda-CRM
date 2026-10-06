import { prisma } from '../prisma';
import { resolveLocationTiered } from './geocoder';
import { getActiveBranchesCached } from './cache';

export interface BranchCandidate {
  id: number;
  name: string;
  code: string;
  city: string;
  latitude: number;
  longitude: number;
  radiusKm?: number | null;
  isActive: boolean;
}

export interface BranchDistance extends BranchCandidate {
  distanceKm: number;
}

export interface RoutingResolvedLocation {
  query: string;
  canonicalName: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  source: string;
}

export interface RoutingResult {
  assignedBranch: BranchCandidate | null;
  distanceKm: number | null;
  allBranchesRanked?: BranchDistance[];
  resolvedLocation: RoutingResolvedLocation | null;
  isOutOfState: boolean;
  isUnresolved: boolean;
  status: 'assigned' | 'out_of_state' | 'unresolved' | 'no_active_branches';
  reason: string;
}

export interface RoutingOptions {
  candidateBranches?: BranchCandidate[];
  skipExternalGeocode?: boolean;
}

/**
 * Calculates the great-circle distance between two pairs of coordinates
 * using the Haversine formula (Earth radius = 6371 km).
 * Returns distance in kilometers rounded to 2 decimal places.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const R = 6371; // Earth's mean radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Finds the nearest operational branch to the given lead coordinates.
 * Excludes inactive branches and branches with missing (0,0) coordinates.
 * Served from in-memory cache (< 0.001ms).
 */
export async function findNearestBranch(
  leadLat: number,
  leadLon: number,
  candidateBranches?: BranchCandidate[]
): Promise<{
  nearestBranch: BranchCandidate | null;
  distanceKm: number | null;
  ranked: BranchDistance[];
}> {
  let branches: BranchCandidate[] = [];

  if (candidateBranches && candidateBranches.length > 0) {
    branches = candidateBranches;
  } else {
    branches = await getActiveBranchesCached();
  }

  // Filter for active branches with valid non-zero coordinates
  const validBranches = branches.filter((b) => {
    if (!b.isActive) return false;
    if (typeof b.latitude !== 'number' || typeof b.longitude !== 'number') return false;
    if (b.latitude === 0 && b.longitude === 0) return false;
    return true;
  });

  if (validBranches.length === 0) {
    return {
      nearestBranch: null,
      distanceKm: null,
      ranked: [],
    };
  }

  // Calculate Haversine distance for each branch and sort ascending
  const ranked: BranchDistance[] = validBranches
    .map((branch) => ({
      ...branch,
      distanceKm: calculateHaversineDistance(
        leadLat,
        leadLon,
        branch.latitude,
        branch.longitude
      ),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = ranked[0];

  return {
    nearestBranch: nearest,
    distanceKm: nearest.distanceKm,
    ranked,
  };
}

/**
 * Full Pipeline: Resolves a lead's location query through the tiered resolver
 * and assigns the lead to the closest active branch.
 * Out-of-state and regional leads are assigned to the geographically closest SGA dealership branch.
 */
export async function routeLeadToBranch(
  locationQuery: string,
  options?: RoutingOptions
): Promise<RoutingResult> {
  const activeBranches = options?.candidateBranches?.length
    ? options.candidateBranches
    : await getActiveBranchesCached();

  const flagshipBranch =
    activeBranches.find((b) => b.name.toLowerCase().includes('singanallur')) ||
    activeBranches[0] ||
    null;

  if (!locationQuery || typeof locationQuery !== 'string' || !locationQuery.trim()) {
    return {
      assignedBranch: null,
      distanceKm: null,
      resolvedLocation: null,
      isOutOfState: false,
      isUnresolved: true,
      status: 'unresolved',
      reason: 'No location specified - kept unassigned',
    };
  }

  // 1. Resolve coordinates via Tiered Resolver (Dictionary -> In-Memory Cache -> Geocoder)
  const locResult = await resolveLocationTiered(locationQuery.trim(), {
    skipExternal: options?.skipExternalGeocode,
  });

  const isOutOfState = !locResult.isTamilNadu;

  const resolvedMeta: RoutingResolvedLocation | null = locResult.canonicalName
    ? {
        query: locResult.query,
        canonicalName: locResult.canonicalName,
        district: locResult.district,
        state: locResult.state || (isOutOfState ? 'Outside Tamil Nadu' : 'Tamil Nadu'),
        latitude: locResult.latitude,
        longitude: locResult.longitude,
        source: locResult.source,
      }
    : null;

  // 2. If lead is outside Tamil Nadu: keep unassigned and classify as out_of_state
  if (locResult.matched && isOutOfState) {
    return {
      assignedBranch: null,
      distanceKm: null,
      allBranchesRanked: [],
      resolvedLocation: resolvedMeta,
      isOutOfState: true,
      isUnresolved: false,
      status: 'out_of_state',
      reason: `Location "${resolvedMeta?.canonicalName || locationQuery}" in ${resolvedMeta?.state || 'another state'} is outside Tamil Nadu - kept unassigned`,
    };
  }

  // 3. If lead specifies generic Tamil Nadu state without city: assign to flagship branch
  if (locResult.canonicalName && locResult.canonicalName.toLowerCase() === 'tamil nadu' && flagshipBranch) {
    return {
      assignedBranch: flagshipBranch,
      distanceKm: 0,
      allBranchesRanked: activeBranches.map((b) => ({ ...b, distanceKm: 0 })),
      resolvedLocation: resolvedMeta,
      isOutOfState: false,
      isUnresolved: false,
      status: 'assigned',
      reason: `Assigned to flagship branch ${flagshipBranch.name} (state-wide Tamil Nadu lead)`,
    };
  }

  // 4. If Tamil Nadu coordinates were resolved, discover geographically nearest active branch
  if (locResult.matched && locResult.latitude !== 0 && locResult.longitude !== 0) {
    const { nearestBranch, distanceKm, ranked } = await findNearestBranch(
      locResult.latitude,
      locResult.longitude,
      activeBranches
    );

    if (nearestBranch && distanceKm !== null) {
      return {
        assignedBranch: nearestBranch,
        distanceKm,
        allBranchesRanked: ranked,
        resolvedLocation: resolvedMeta,
        isOutOfState: false,
        isUnresolved: false,
        status: 'assigned',
        reason: `Assigned to nearest branch ${nearestBranch.name} (${distanceKm} km away via ${locResult.source})`,
      };
    }
  }

  // 5. Fallback for unresolvable or unknown locations: keep unassigned
  return {
    assignedBranch: null,
    distanceKm: null,
    allBranchesRanked: [],
    resolvedLocation: resolvedMeta,
    isOutOfState: false,
    isUnresolved: true,
    status: 'unresolved',
    reason: `Location "${locationQuery}" could not be resolved - kept unassigned`,
  };
}

/**
 * Fast in-memory nearest branch routing (< 1ms).
 * Strictly skips external API calls, using local dictionary and in-memory cache.
 */
export async function routeLeadToBranchFast(
  locationQuery: string,
  options?: RoutingOptions
): Promise<RoutingResult> {
  return routeLeadToBranch(locationQuery, {
    ...options,
    skipExternalGeocode: true,
  });
}

/**
 * Records routing decision and distance into LeadActivity audit log.
 */
export async function logRoutingActivity(
  leadId: number,
  result: RoutingResult,
  username = 'System'
): Promise<void> {
  try {
    let action = 'ROUTING_INFO';
    let newValue = result.reason;

    if (result.status === 'assigned' && result.assignedBranch) {
      action = 'AUTO_ASSIGN_BRANCH';
      newValue = `Assigned to ${result.assignedBranch.name} (${result.distanceKm} km away via ${
        result.resolvedLocation?.source || 'location'
      })`;
    } else if (result.status === 'out_of_state') {
      action = 'ROUTING_OUT_OF_STATE';
      newValue = `Lead location "${result.resolvedLocation?.canonicalName || ''}" in ${
        result.resolvedLocation?.state || 'external state'
      } is out of state - unassigned`;
    } else if (result.status === 'unresolved') {
      action = 'ROUTING_UNRESOLVED';
      newValue = `Location could not be resolved - unassigned`;
    }

    await prisma.leadActivity.create({
      data: {
        leadId,
        username,
        action,
        oldValue: null,
        newValue,
      },
    });
  } catch (err) {
    console.error(`Failed to log routing activity for lead ${leadId}:`, err);
  }
}
