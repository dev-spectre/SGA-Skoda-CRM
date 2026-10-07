import { isInvalidPhoneNumber } from './utils';
import { resolveLocation, extractPincode } from './location/matcher';
import { getCachedLocationFromMemory, ensureLocationCacheLoaded } from './location/cache';
import { normalizeKey } from './location/tn-locations';
import { prisma } from './prisma';
import { TAMIL_NADU_BOUNDS } from './location/geocoder';

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
 * Prominent outside locations to match via case-insensitive `contains` in SQL.
 * Any lead whose city contains one of these (with word boundaries or substrings)
 * is considered outside Tamil Nadu.
 */
export const OUTSIDE_CONTAINS_PATTERNS = [
  // States & Union Territories
  'bihar', 'jharkhand', 'uttar pradesh', 'madhya pradesh', 'rajasthan', 'gujarat',
  'maharashtra', 'punjab', 'haryana', 'odisha', 'orissa', 'west bengal', 'bengal',
  'assam', 'chhattisgarh', 'chattisgarh', 'uttarakhand', 'himachal pradesh', 'kashmir',
  'goa', 'kerala', 'karnataka', 'andhra pradesh', 'andhra', 'telangana', 'delhi',
  // Major Tier-1 / Tier-2 Indian cities outside TN
  'bangalore', 'bengaluru', 'mysore', 'mysuru', 'mangalore', 'mangaluru', 'hubli',
  'belgaum', 'bellary', 'davanagere', 'shimoga', 'tumkur', 'raichur', 'bidar', 'hassan',
  'palakkad', 'palghat', 'thrissur', 'trichur', 'ernakulam', 'kochi', 'cochin', 'calicut',
  'kozhikode', 'trivandrum', 'thiruvananthapuram', 'kollam', 'alappuzha', 'kottayam',
  'kannur', 'kasaragod', 'wayanad', 'malappuram', 'idukki', 'pathanamthitta', 'pattambi',
  'hyderabad', 'secunderabad', 'vijayawada', 'visakhapatnam', 'vizag', 'guntur', 'nellore',
  'kurnool', 'kadapa', 'anantapur', 'rajahmundry', 'kakinada', 'warangal', 'tirupati',
  'patna', 'gaya', 'begusarai', 'ranchi', 'bhagalpur', 'samastipur', 'motihari', 'darbhanga',
  'kishanganj', 'madhepura', 'jamshedpur', 'vaishali', 'purnea', 'purnia', 'madhubani',
  'muzaffarpur', 'dhanbad', 'bokaro', 'bihar sharif',
  'mumbai', 'pune', 'nagpur', 'thane', 'nashik', 'aurangabad', 'solapur', 'kolhapur',
  'navi mumbai', 'ahmedabad', 'surat', 'vadodara', 'baroda', 'rajkot', 'bhavnagar', 'jamnagar',
  'jaipur', 'jodhpur', 'udaipur', 'kota', 'bikaner', 'ajmer', 'bharatpur', 'alwar',
  'bhopal', 'indore', 'jabalpur', 'gwalior', 'ujjain', 'sagar', 'dewas', 'satna', 'ratlam',
  'jhabua', 'raipur', 'bilaspur', 'durg', 'bhilai',
  'lucknow', 'kanpur', 'agra', 'varanasi', 'prayagraj', 'allahabad', 'noida', 'ghaziabad',
  'bareilly', 'aligarh', 'moradabad', 'gorakhpur', 'meerut', 'mathura', 'dehradun', 'haridwar',
  'chandigarh', 'ludhiana', 'amritsar', 'jalandhar', 'patiala', 'gurgaon', 'gurugram',
  'faridabad', 'panipat', 'ambala', 'rohtak', 'hisar', 'karnal', 'shimla', 'srinagar', 'jammu',
  'kolkata', 'calcutta', 'howrah', 'siliguri', 'durgapur', 'asansol', 'bhubaneswar', 'cuttack',
  'rourkela', 'guwahati', 'aizawl', 'giridih', 'barmer', 'pratapgarh', 'guna', 'kasganj',
  'dubai'
];

/**
 * Recognized locations / cities strictly OUTSIDE Tamil Nadu.
 * Used for fast string matching in classification and database queries.
 */
export const OUTSIDE_TN_PATTERNS = [
  ...OUTSIDE_CONTAINS_PATTERNS,
  // Karnataka additions
  'mandya', 'udupi', 'kolar', 'shivamogga', 'hubballi', 'belagavi', 'ballari',
  'kalaburagi', 'hosapete', 'gadag', 'periyapatna', 'chikmagalur', 'chitradurga',
  'bagalkot', 'karwar', 'haveri', 'yadgir',
  // Kerala additions
  'thalassery', 'manjeri', 'tirur', 'ponnani', 'ottapalam', 'shoranur', 'chittur',
  'alathur', 'chalakudy', 'kodungallur', 'irinjalakuda', 'angamaly', 'aluva',
  'perumbavoor', 'muvattupuzha', 'kothamangalam', 'thodupuzha', 'pala', 'changanassery',
  'thiruvalla', 'chengannur', 'kayamkulam', 'adoor', 'punalur', 'attingal', 'neyyattinkara',
  'varkala', 'cherthala', 'kottakkal', 'guruvayur',
  // Andhra & Telangana additions
  'chittoor', 'madanapalle', 'hindupur', 'nizamabad', 'khammam', 'karimnagar',
  'eluru', 'ongole', 'nandyal', 'machilipatnam', 'adoni', 'tenali', 'proddatur',
  // North / West additions
  'new delhi', 'greater noida', 'firozabad', 'jhansi', 'muzaffarnagar', 'ayodhya',
  'roorkee', 'rishikesh', 'bhilwara', 'sikar', 'chittorgarh', 'anand', 'navsari',
  'morbi', 'surendranagar', 'bharuch', 'vapi', 'valsad', 'kalyan', 'dombivli', 'vasai',
  'rewa', 'korba', 'bathinda', 'mohali', 'yamunanagar', 'sonipat', 'panchkula',
  'puri', 'silchar', 'imphal', 'shillong', 'agartala'
];

/**
 * In-memory cache for dynamic SQL filter conditions (60s TTL)
 */
let cachedCategoryConditions: {
  outsideLocationCondition: any;
  validLocationCondition: any;
  timestamp: number;
} | null = null;

/**
 * Builds dynamic SQL where conditions for 'valid' and 'outside' categories.
 * Integrates:
 * 1. Prominent outside state/city substrings (contains)
 * 2. All confirmed outside searchTerms from PostgreSQL LocationCache
 * 3. Bounding box & out-of-state verification
 * 4. Exemption for valid TN locations like 'Veerakeralam'
 */
export async function getCategoryFilterConditions() {
  const now = Date.now();
  if (cachedCategoryConditions && (now - cachedCategoryConditions.timestamp < 60000)) {
    return {
      outsideLocationCondition: cachedCategoryConditions.outsideLocationCondition,
      validLocationCondition: cachedCategoryConditions.validLocationCondition,
    };
  }

  // Load confirmed outside entries from LocationCache
  let outsideCacheTerms = new Set<string>();
  try {
    const outsideCached = await prisma.locationCache.findMany({
      where: {
        OR: [
          {
            AND: [
              { state: { not: '' } },
              { NOT: { state: { contains: 'Tamil Nadu', mode: 'insensitive' } } },
              { NOT: { state: { contains: 'Puducherry', mode: 'insensitive' } } },
              { NOT: { state: { contains: 'Pondicherry', mode: 'insensitive' } } },
            ]
          },
          { latitude: { lt: TAMIL_NADU_BOUNDS.minLat } },
          { latitude: { gt: TAMIL_NADU_BOUNDS.maxLat } },
          { longitude: { lt: TAMIL_NADU_BOUNDS.minLon } },
          { longitude: { gt: TAMIL_NADU_BOUNDS.maxLon } },
        ]
      },
      select: { searchTerm: true, canonicalName: true }
    });

    outsideCached.forEach((c: { searchTerm: string; canonicalName: string }) => {
      if (c.searchTerm) outsideCacheTerms.add(c.searchTerm.toLowerCase().trim());
      if (c.canonicalName) outsideCacheTerms.add(c.canonicalName.toLowerCase().trim());
    });
  } catch (err) {
    console.warn('Failed to load outside terms from LocationCache:', err);
  }

  const outsideConditions: any[] = [];

  // 1. Substring contains conditions for prominent outside states and major cities
  for (const term of OUTSIDE_CONTAINS_PATTERNS) {
    if (term === 'kerala') {
      outsideConditions.push({
        AND: [
          { city: { contains: 'kerala', mode: 'insensitive' as const } },
          { NOT: { city: { contains: 'veerakeralam', mode: 'insensitive' as const } } }
        ]
      });
    } else {
      outsideConditions.push({ city: { contains: term, mode: 'insensitive' as const } });
    }
  }

  // 2. Exact equals conditions for all remaining outside patterns and cached entries
  for (const p of OUTSIDE_TN_PATTERNS) {
    if (!OUTSIDE_CONTAINS_PATTERNS.includes(p)) {
      outsideConditions.push({ city: { equals: p, mode: 'insensitive' as const } });
    }
  }

  for (const t of outsideCacheTerms) {
    if (!OUTSIDE_CONTAINS_PATTERNS.includes(t)) {
      outsideConditions.push({ city: { equals: t, mode: 'insensitive' as const } });
    }
  }

  const outsideLocationCondition = {
    isInvalidPhone: false,
    OR: outsideConditions,
  };

  const validLocationCondition = {
    isInvalidPhone: false,
    NOT: {
      OR: outsideConditions,
    },
  };

  cachedCategoryConditions = {
    outsideLocationCondition,
    validLocationCondition,
    timestamp: now,
  };

  return { outsideLocationCondition, validLocationCondition };
}

/**
 * Checks if a given text clearly represents an out-of-state location.
 */
export function isOutsideTamilNadu(text?: string | null): boolean {
  if (!text) return false;
  const raw = text.toLowerCase().trim();
  if (!raw) return false;

  // 1. Check out-of-state pincode (6-digit PIN outside 600xxx-643xxx)
  const pinCheck = extractPincode(raw);
  if (pinCheck.isOutOfStatePincode) return true;

  // 2. Check exact local Tamil Nadu dictionary FIRST:
  // If exact match in TN dictionary, it is inside TN (e.g. Veerakeralam, Arcot, Paramakudi)
  const exactTN = resolveLocation(raw, { exactOnly: true });
  if (exactTN.matched && !exactTN.isOutOfState) {
    return false;
  }

  // 3. Check in-memory cached location
  const norm = normalizeKey(raw);
  try {
    const cached = getCachedLocationFromMemory(norm);
    if (cached) {
      return !cached.isTamilNadu;
    }
  } catch {
    // ignore
  }

  // 4. Check known outside patterns with token / word boundaries
  const tokens = raw.split(/[\s,./\\_@#+()-]+/).filter(Boolean);
  const normTokens = norm.split(/[\s,./\\_@#+()-]+/).filter(Boolean);

  for (const pattern of OUTSIDE_TN_PATTERNS) {
    if (pattern.includes(' ')) {
      if (raw.includes(pattern) || norm.includes(pattern)) {
        return true;
      }
    } else {
      if (tokens.includes(pattern) || normTokens.includes(pattern) || raw === pattern || norm === pattern) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a given text clearly represents an in-state Tamil Nadu location.
 */
export function isInsideTamilNadu(text?: string | null): boolean {
  if (!text) return false;
  const raw = text.toLowerCase().trim();
  if (!raw) return false;

  // 1. Check out-of-state first
  if (isOutsideTamilNadu(text)) return false;

  // 2. Check 6-digit Tamil Nadu pincode (600xxx - 643xxx)
  const pinCheck = extractPincode(raw);
  if (pinCheck.pincode && !pinCheck.isOutOfStatePincode) return true;

  // 3. Check static dictionary
  const loc = resolveLocation(raw);
  if (loc.matched && !loc.isOutOfState) return true;

  // 4. Check in-memory cached location
  try {
    const cached = getCachedLocationFromMemory(normalizeKey(raw));
    if (cached && cached.isTamilNadu) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Classifies a lead into one of the primary mutually exclusive categories:
 * - 'invalid': leads with invalid phone number
 * - 'valid': Tamil Nadu leads with valid phone number (default for local dealership leads)
 * - 'outside': leads outside Tamil Nadu
 */
export function classifyLead(
  lead: LeadClassificationInput,
  activeBranches?: string[] | Set<string>
): 'valid' | 'invalid' | 'outside' {
  // 1. Invalid: leads with invalid phone number
  if (lead.isInvalidPhone || isInvalidPhoneNumber(lead.phone)) {
    return 'invalid';
  }

  const city = (lead.city || '').trim();
  const branch = (lead.branch || '').trim();

  // 2. If city is explicitly outside Tamil Nadu -> 'outside'
  if (city && isOutsideTamilNadu(city)) {
    return 'outside';
  }

  // 3. If branch is explicitly outside Tamil Nadu -> 'outside'
  if (branch && isOutsideTamilNadu(branch)) {
    return 'outside';
  }

  // 4. If city is verified inside Tamil Nadu -> 'valid'
  if (city && isInsideTamilNadu(city)) {
    return 'valid';
  }

  // 5. If branch is an active dealership branch or recognized TN location -> 'valid'
  if (branch) {
    if (isInsideTamilNadu(branch)) {
      return 'valid';
    }
    const branchClean = branch.toLowerCase().trim();
    const normalizedBranch = branchClean.replace(/^sga\s+(motors\s+)?/i, '').trim();

    if (activeBranches) {
      const hasMatch = Array.isArray(activeBranches)
        ? activeBranches.some((b) => {
            const bLower = b.toLowerCase().trim();
            const bNorm = bLower.replace(/^sga\s+(motors\s+)?/i, '').trim();
            return bLower === branchClean || bNorm === normalizedBranch || bLower === normalizedBranch;
          })
        : activeBranches.has(branchClean) || activeBranches.has(normalizedBranch);
      if (hasMatch) {
        return 'valid';
      }
    }
  }

  // 6. Default territory for SGA Skoda leads:
  // If not explicitly detected as outside Tamil Nadu, consider it valid within dealership territory
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
