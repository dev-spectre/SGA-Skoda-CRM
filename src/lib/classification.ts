import { isInvalidPhoneNumber } from './utils';
import { resolveLocation, extractPincode } from './location/matcher';

export type LeadCategory = 'valid' | 'invalid' | 'outside' | 'all' | 'priority';

export interface LeadClassificationInput {
  phone?: string | null;
  city?: string | null;
  branch?: string | null;
  isInvalidPhone?: boolean;
  isBranchManual?: boolean;
  followUpDate1?: string | Date | null;
  followUpDate2?: string | Date | null;
}

/**
 * Classifies a lead into one of the primary mutually exclusive categories:
 * - 'invalid': leads with invalid phone number
 * - 'valid': Tamil Nadu leads with valid phone number (default)
 * - 'outside': leads outside Tamil Nadu / unassigned branch
 */
export function classifyLead(
  lead: LeadClassificationInput,
  activeBranches?: string[] | Set<string>
): 'valid' | 'invalid' | 'outside' {
  // 1. Invalid: leads with invalid phone number
  if (lead.isInvalidPhone || isInvalidPhoneNumber(lead.phone)) {
    return 'invalid';
  }

  const branchClean = (lead.branch || '').toLowerCase().trim();
  const normalizedBranch = branchClean.replace(/^sga\s+(motors\s+)?/i, '').trim();

  let hasActiveBranch = false;
  if (activeBranches) {
    if (Array.isArray(activeBranches)) {
      hasActiveBranch = activeBranches.some((b) => {
        const bLower = b.toLowerCase().trim();
        const bNorm = bLower.replace(/^sga\s+(motors\s+)?/i, '').trim();
        return bLower === branchClean || bNorm === normalizedBranch || bLower === normalizedBranch;
      });
    } else {
      hasActiveBranch =
        activeBranches.has(branchClean) ||
        activeBranches.has(normalizedBranch) ||
        Array.from(activeBranches).some((b) => {
          const bLower = b.toLowerCase().trim();
          const bNorm = bLower.replace(/^sga\s+(motors\s+)?/i, '').trim();
          return bLower === branchClean || bNorm === normalizedBranch;
        });
    }
  } else {
    hasActiveBranch = Boolean(branchClean);
  }

  // If assigned to a recognized active dealership branch, it is valid
  if (hasActiveBranch) {
    return 'valid';
  }

  // 2. Check location for unassigned leads
  const city = (lead.city || '').trim();
  if (city) {
    // Check out-of-state postal code
    const pinCheck = extractPincode(city);
    if (pinCheck.isOutOfStatePincode) {
      return 'outside';
    }

    // Check Tamil Nadu local dictionary
    const loc = resolveLocation(city);
    if (loc.isOutOfState) {
      return 'outside';
    }
    if (loc.matched) {
      // In Tamil Nadu dictionary but not yet assigned
      return 'valid';
    }

    // If city is non-empty and does not match any Tamil Nadu location or typo,
    // and has no active branch assigned, it is outside Tamil Nadu
    return 'outside';
  }

  // If no city and no active branch, unassigned leads outside dealership territory
  return 'outside';
}

/**
 * Helper to check if a lead matches a specific category filter
 */
export function matchesLeadCategory(
  lead: LeadClassificationInput,
  category: LeadCategory,
  activeBranches?: string[] | Set<string>
): boolean {
  if (category === 'all' || !category) {
    return true;
  }
  return classifyLead(lead, activeBranches) === category;
}
