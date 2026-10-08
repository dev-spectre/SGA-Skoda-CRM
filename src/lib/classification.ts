import { isInvalidPhoneNumber } from './utils';
import { isLocationOutsideTamilNadu } from './location/out-of-state';

export type LeadCategory = 'valid' | 'invalid' | 'outside' | 'all' | 'priority';

export interface LeadClassificationInput {
  phone?: string | null;
  city?: string | null;
  branch?: string | null;
  isInvalidPhone?: boolean;
  isOutOfState?: boolean;
  isBranchManual?: boolean;
  followUpDate1?: string | Date | null;
  followUpDate2?: string | Date | null;
}

/**
 * Classifies a lead into one of the primary mutually exclusive categories:
 * - 'invalid': leads with invalid phone number (wrong/extra/missing digits)
 * - 'outside': leads confirmed to be outside Tamil Nadu state
 * - 'valid': leads inside Tamil Nadu with valid phone number (default for dealership territory)
 */
export function classifyLead(
  lead: LeadClassificationInput,
  _activeBranches?: string[] | Set<string>
): 'valid' | 'invalid' | 'outside' {
  // 1. Invalid: leads with invalid phone number
  if (lead.isInvalidPhone || isInvalidPhoneNumber(lead.phone)) {
    return 'invalid';
  }

  // 2. Outside: leads outside Tamil Nadu
  if (lead.isOutOfState) {
    return 'outside';
  }

  const city = (lead.city || '').trim();
  if (city) {
    if (isLocationOutsideTamilNadu(city)) {
      return 'outside';
    }
  }

  // 3. Valid: leads inside Tamil Nadu with valid phone number
  return 'valid';
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
