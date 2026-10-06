import { LocationMatchResult, LocationNode, MatcherOptions } from './types';
import {
  TN_LOCATIONS,
  PINCODE_INDEX,
  EXACT_INDEX,
  ALIAS_INDEX,
  TAMIL_SCRIPT_MAP,
  normalizeKey,
  UNICODE_LOOKALIKES,
} from './tn-locations';

/**
 * Checks whether two words share a compatible first letter or common transliteration pair.
 * Helps prevent false identification of other Indian cities (e.g. Nellore vs Vellore, Kanpur vs Annur).
 */
export function areFirstLettersCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  const c1 = a[0];
  const c2 = b[0];
  if (c1 === c2) return true;
  // Transliteration pair: c and k (e.g. Coimbatore / Koimbatore, Cuddalore / Kuddalore)
  if ((c1 === 'c' && c2 === 'k') || (c1 === 'k' && c2 === 'c')) return true;
  // t and th
  if ((a.startsWith('th') && c2 === 't') || (b.startsWith('th') && c1 === 't')) return true;
  return false;
}

// Noise words stripped during string tokenization
const NOISE_WORDS = new Set([
  'district',
  'dist',
  'city',
  'town',
  'post',
  'po',
  'dt',
  'taluk',
  'tk',
  'near',
  'opp',
  'opposite',
  'road',
  'rd',
  'street',
  'st',
  'area',
  'nagar',
  'junction',
  'bus',
  'stand',
  'stop',
  'village',
  'pincode',
  'pin',
  'no',
]);

/**
 * Normalizes an incoming location/city string:
 * 1. Converts stylized unicode & homoglyphs
 * 2. Lowercases and applies NFKD
 * 3. Corrects embedded OCR / typo digits
 * 4. Preserves Tamil characters and alphanumeric tokens
 */
export function normalizeString(input: string): string {
  if (!input) return '';

  // 1. Substitute lookalikes
  let s = '';
  for (const ch of input) {
    s += UNICODE_LOOKALIKES[ch] || ch;
  }

  // 2. NFKD lowercase
  s = s.normalize('NFKD').toLowerCase();

  // 3. Embedded typo/OCR digits
  s = s
    .replace(/([a-z])0([a-z])/g, '$1o$2')
    .replace(/0([a-z])/g, 'o$1')
    .replace(/([a-z])0/g, '$1o')
    .replace(/([a-z])1([a-z])/g, '$1i$2')
    .replace(/([a-z])5([a-z])/g, '$1s$2');

  // 4. Strip single-letter initial dot prefix (e.g. "t.kallupatti" -> "kallupatti", "p.n. patti" -> "pn patti")
  s = s.replace(/\b[a-z]\.\s*/g, ' ');

  // 5. Replace parentheses and punctuation with spaces
  s = s.replace(/[()[\]{},;:\/\\_-]/g, ' ');

  // 6. Strip standalone non-pincode numbers (e.g. "coimbatore 24." -> "coimbatore")
  s = s.replace(/\b\d{1,5}\b/g, ' ');

  return s
    .replace(/[^\w\s\u0B80-\u0BFF]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token))
    .join(' ')
    .trim();
}

/**
 * Extracts a 6-digit Tamil Nadu postal code (600xxx to 643xxx) anywhere in string.
 * Also detects out-of-state pincodes (100000 to 599999 or 670000 to 899999).
 */
export function extractPincode(input: string): { pincode: string | null; isOutOfStatePincode: boolean } {
  if (!input) return { pincode: null, isOutOfStatePincode: false };

  // Look for any 6-digit sequence embedded or separated
  const match = input.match(/(?:^|\D)([1-8]\d{5})(?:\D|$)/);
  if (!match) return { pincode: null, isOutOfStatePincode: false };

  const pin = match[1];
  const pinNum = parseInt(pin, 10);

  // Tamil Nadu pincodes strictly range between 600001 and 643999 (plus Puducherry 605xxx, Karaikal 6096xx)
  if (pinNum >= 600001 && pinNum <= 643999) {
    return { pincode: pin, isOutOfStatePincode: false };
  }

  // Any other 6-digit Indian pincode is out-of-state (e.g. Bangalore 560091, Kerala 670xxx-695xxx, etc.)
  return { pincode: null, isOutOfStatePincode: true };
}

/**
 * Fast Damerau-Levenshtein distance with transposition support.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  if (la === 0) return lb;
  if (lb === 0) return la;

  const d: number[][] = Array.from({ length: la + 1 }, () =>
    new Array(lb + 1).fill(0)
  );

  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[la][lb];
}

/**
 * Calculates similarity ratio (0.0 to 1.0) based on edit distance.
 */
export function calculateSimilarity(
  a: string,
  b: string,
  distance: number
): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return Math.max(0, 1.0 - distance / maxLen);
}

/**
 * Phonetic & Tamil transliteration canonicalization.
 * Replaces common Tamil English spelling permutations:
 * - th/t, dh/d, b/p, g/k, zh/l
 * - deduplicates consonants (tt -> t, pp -> p, etc.)
 */
export function phoneticCanonicalize(word: string): string {
  if (!word || word.length < 3) return word;
  return word
    .toLowerCase()
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/zh/g, 'l')
    .replace(/ai|ay|ey/g, 'e')
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/b/g, 'p')
    .replace(/g/g, 'k')
    .replace(/([a-z])\1+/g, '$1'); // deduplicate double letters (tt->t, pp->p, kk->k)
}

/**
 * Pre-compiled list of candidate targets for fuzzy scanning
 */
interface FuzzyCandidate {
  key: string;
  phoneticKey: string;
  node: LocationNode;
}

const FUZZY_CANDIDATES: FuzzyCandidate[] = [];
for (const loc of TN_LOCATIONS) {
  const k = normalizeKey(loc.name);
  if (k && k.length >= 3) {
    FUZZY_CANDIDATES.push({
      key: k,
      phoneticKey: phoneticCanonicalize(k),
      node: loc,
    });
  }
  if (loc.aliases) {
    for (const alias of loc.aliases) {
      const ak = normalizeKey(alias);
      if (ak && ak.length >= 3) {
        FUZZY_CANDIDATES.push({
          key: ak,
          phoneticKey: phoneticCanonicalize(ak),
          node: loc,
        });
      }
    }
  }
}

/**
 * Resolves an arbitrary location or city query string to a canonical Tamil Nadu location.
 * Evaluates through an intelligent cascade:
 *   0. Out-of-State / Junk early rejection
 *   1. Tamil Native Script direct resolution
 *   2. 6-digit Pincode matching
 *   3. Exact Canonical & Alias O(1) hash lookup
 *   4. Substring & Word Token extraction (address scanning)
 *   5. Typo-tolerant Phonetic & Damerau-Levenshtein edit-distance
 */
export function resolveLocation(
  rawQuery: string,
  options?: MatcherOptions
): LocationMatchResult {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return {
      matched: false,
      query: rawQuery || '',
      canonicalName: '',
      district: '',
      latitude: 0,
      longitude: 0,
      matchType: 'none',
      confidence: 0,
    };
  }

  const query = rawQuery.trim();
  const minConfidence = options?.minConfidence ?? 0.70;

  // ----------------------------------------------------
  // Stage 0: Out-of-State / Junk Early Filtering
  // ----------------------------------------------------
  const normKey = normalizeKey(query);

  // Check out-of-state pincode (e.g. Bangalore560091)
  const pinCheck = extractPincode(query);
  if (pinCheck.isOutOfStatePincode) {
    return {
      matched: false,
      query,
      canonicalName: '',
      district: '',
      latitude: 0,
      longitude: 0,
      matchType: 'none',
      confidence: 0,
      isOutOfState: true,
    };
  }


  // Check if query is pure numbers / phone numbers or too short junk
  if (/^\d{6,}$/.test(normKey) && !pinCheck.pincode) {
    return {
      matched: false,
      query,
      canonicalName: '',
      district: '',
      latitude: 0,
      longitude: 0,
      matchType: 'none',
      confidence: 0,
    };
  }

  if (normKey.length < 2 && !/[\u0B80-\u0BFF]/.test(query)) {
    return {
      matched: false,
      query,
      canonicalName: '',
      district: '',
      latitude: 0,
      longitude: 0,
      matchType: 'none',
      confidence: 0,
    };
  }

  // ----------------------------------------------------
  // Stage 1: Tamil Native Script Direct Resolution (O(1))
  // ----------------------------------------------------
  if (/[\u0B80-\u0BFF]/.test(query)) {
    // 1. Direct map lookup
    const canonicalFromTamil = TAMIL_SCRIPT_MAP[query] || TAMIL_SCRIPT_MAP[normKey];
    if (canonicalFromTamil) {
      const node = EXACT_INDEX.get(normalizeKey(canonicalFromTamil));
      if (node) {
        return {
          matched: true,
          query,
          canonicalName: node.name,
          district: node.district,
          latitude: node.latitude,
          longitude: node.longitude,
          matchType: 'tamil',
          confidence: 1.0,
        };
      }
    }

    // 2. Token-level Tamil map lookup
    const tamilTokens = query.split(/[\s,.-]+/);
    for (const tk of tamilTokens) {
      const cleanTk = tk.trim();
      const mapped = TAMIL_SCRIPT_MAP[cleanTk] || TAMIL_SCRIPT_MAP[normalizeKey(cleanTk)];
      if (mapped) {
        const node = EXACT_INDEX.get(normalizeKey(mapped));
        if (node) {
          return {
            matched: true,
            query,
            canonicalName: node.name,
            district: node.district,
            latitude: node.latitude,
            longitude: node.longitude,
            matchType: 'tamil',
            confidence: 0.98,
          };
        }
      }
    }
  }

  // ----------------------------------------------------
  // Stage 2: 6-Digit Tamil Nadu Pincode Matching (O(1))
  // ----------------------------------------------------
  if (pinCheck.pincode) {
    const node = PINCODE_INDEX.get(pinCheck.pincode);
    if (node) {
      return {
        matched: true,
        query,
        canonicalName: node.name,
        district: node.district,
        latitude: node.latitude,
        longitude: node.longitude,
        pincode: pinCheck.pincode,
        matchType: 'pincode',
        confidence: 1.0,
      };
    }
  }

  // ----------------------------------------------------
  // Stage 3: Exact Canonical & Curated Alias Lookup (O(1))
  // ----------------------------------------------------
  if (normKey) {
    const exactNode = EXACT_INDEX.get(normKey);
    if (exactNode) {
      return {
        matched: true,
        query,
        canonicalName: exactNode.name,
        district: exactNode.district,
        latitude: exactNode.latitude,
        longitude: exactNode.longitude,
        matchType: 'exact',
        confidence: 1.0,
      };
    }

    const aliasNode = ALIAS_INDEX.get(normKey);
    if (aliasNode) {
      return {
        matched: true,
        query,
        canonicalName: aliasNode.name,
        district: aliasNode.district,
        latitude: aliasNode.latitude,
        longitude: aliasNode.longitude,
        matchType: 'alias',
        confidence: 0.98,
      };
    }
  }

  // Also check parenthetical token if present, e.g. "Ooty (Udhagamandalam)"
  const parenMatch = query.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const parenKey = normalizeKey(parenMatch[1]);
    if (parenKey) {
      const parenNode = EXACT_INDEX.get(parenKey) || ALIAS_INDEX.get(parenKey);
      if (parenNode) {
        return {
          matched: true,
          query,
          canonicalName: parenNode.name,
          district: parenNode.district,
          latitude: parenNode.latitude,
          longitude: parenNode.longitude,
          matchType: 'alias',
          confidence: 0.98,
        };
      }
    }
  }

  // ----------------------------------------------------
  // Stage 4: Substring & Word Token Extraction
  // ----------------------------------------------------
  const cleaned = normalizeString(query);
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);

  let bestTokenMatch: {
    node: LocationNode;
    score: number;
  } | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenKey = normalizeKey(token);
    // Ignore short noise tokens
    if (!tokenKey || tokenKey.length < 4) continue;

    const posBoost = tokens.length > 1 ? (i / (tokens.length - 1)) * 0.02 : 0;
    const lenBoost = Math.min(0.05, (token.length / 12) * 0.05);

    const exactMatch = EXACT_INDEX.get(tokenKey);
    if (exactMatch) {
      const typeBoost =
        exactMatch.type === 'district' ? 0.04 : exactMatch.type === 'city' ? 0.03 : 0.02;
      const score = 0.92 + typeBoost + posBoost + lenBoost;
      if (!bestTokenMatch || score > bestTokenMatch.score) {
        bestTokenMatch = { node: exactMatch, score };
      }
    }

    const aliasMatch = ALIAS_INDEX.get(tokenKey);
    if (aliasMatch) {
      const typeBoost =
        aliasMatch.type === 'district' ? 0.04 : aliasMatch.type === 'city' ? 0.03 : 0;
      const score = 0.86 + typeBoost + posBoost + lenBoost;
      if (!bestTokenMatch || score > bestTokenMatch.score) {
        bestTokenMatch = { node: aliasMatch, score };
      }
    }
  }

  if (bestTokenMatch) {
    return {
      matched: true,
      query,
      canonicalName: bestTokenMatch.node.name,
      district: bestTokenMatch.node.district,
      latitude: bestTokenMatch.node.latitude,
      longitude: bestTokenMatch.node.longitude,
      matchType: 'substring',
      confidence: Math.min(0.96, Number(bestTokenMatch.score.toFixed(3))),
    };
  }

  if (options?.exactOnly) {
    return {
      matched: false,
      query,
      canonicalName: '',
      district: '',
      latitude: 0,
      longitude: 0,
      matchType: 'none',
      confidence: 0,
    };
  }

  // ----------------------------------------------------
  // Stage 5: Smart Misspelling Algorithm for Tamil Nadu Locations
  // Uses strict length guards and first-letter compatibility so real
  // out-of-state cities (e.g. Pune, Kota, Bhind, Nellore, Patna, Kanpur)
  // are NEVER falsely matched to obscure Tamil Nadu hamlets.
  // ----------------------------------------------------
  const targetWords: string[] = [];
  // Rule A: Word must be at least 5 letters for fuzzy matching (len < 5 is exact-only)
  if (normKey && normKey.length >= 5) targetWords.push(normKey);
  for (const t of tokens) {
    const tk = normalizeKey(t);
    if (tk.length >= 5 && !targetWords.includes(tk)) targetWords.push(tk);
    if (tk.startsWith('th')) {
      const alt = 't' + tk.slice(2);
      if (alt.length >= 5 && !targetWords.includes(alt)) targetWords.push(alt);
    }
    if (tk.length >= 6 && (tk.endsWith('y') || tk.endsWith('s'))) {
      const trimmed = tk.slice(0, -1);
      if (trimmed.length >= 5 && !targetWords.includes(trimmed)) targetWords.push(trimmed);
    }
  }

  let bestCandidate: LocationNode | null = null;
  let bestScore = 0;

  for (const word of targetWords) {
    const phoneticWord = phoneticCanonicalize(word);

    for (const cand of FUZZY_CANDIDATES) {
      // Rule B: First letter must be compatible (same letter or transliteration C/K, T/Th)
      if (!areFirstLettersCompatible(word, cand.key)) continue;

      // Rule C: Length difference must not exceed 2
      const lenDiff = Math.abs(word.length - cand.key.length);
      if (lenDiff > 2) continue;

      // Rule D: Strict Damerau-Levenshtein edit distance scaling
      const dist = damerauLevenshtein(word, cand.key);
      const maxAllowedDist = word.length >= 8 ? 2 : 1;

      if (dist <= maxAllowedDist) {
        const sim = calculateSimilarity(word, cand.key, dist);
        if (sim >= 0.80 && sim > bestScore) {
          bestScore = sim;
          bestCandidate = cand.node;
        }
      }

      // Rule E: Constrained phonetic matching (only for words >= 6 chars with dist <= 2)
      if (word.length >= 6 && dist <= 2) {
        if (phoneticWord === cand.phoneticKey) {
          const pScore = 0.90;
          if (pScore > bestScore) {
            bestScore = pScore;
            bestCandidate = cand.node;
          }
        }
      }
    }
  }

  if (bestCandidate && bestScore >= minConfidence) {
    return {
      matched: true,
      query,
      canonicalName: bestCandidate.name,
      district: bestCandidate.district,
      latitude: bestCandidate.latitude,
      longitude: bestCandidate.longitude,
      matchType: 'fuzzy',
      confidence: Number(bestScore.toFixed(3)),
    };
  }

  // ----------------------------------------------------
  // Stage 6: Unresolved / Unknown Location
  // ----------------------------------------------------
  return {
    matched: false,
    query,
    canonicalName: '',
    district: '',
    latitude: 0,
    longitude: 0,
    matchType: 'none',
    confidence: 0,
  };
}
