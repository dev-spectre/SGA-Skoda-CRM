/**
 * Approximate Geographic Bounding Box for Tamil Nadu (+ Puducherry enclaves).
 * South: ~8.08° N (Kanyakumari)
 * North: ~13.55° N (Tiruvallur border / Pulicat Lake)
 * West:  ~76.23° E (Nilgiris / Anaimalai western borders)
 * East:  ~80.35° E (Bay of Bengal coast / Chennai & Puducherry)
 */
export const TAMIL_NADU_BOUNDS = {
  minLat: 8.08,
  maxLat: 13.55,
  minLon: 76.23,
  maxLon: 80.35,
} as const;

/**
 * Checks whether given latitude and longitude coordinates fall within
 * the Tamil Nadu bounding rectangle.
 */
export function isWithinTamilNaduBounds(lat: number, lon: number): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  return (
    lat >= TAMIL_NADU_BOUNDS.minLat &&
    lat <= TAMIL_NADU_BOUNDS.maxLat &&
    lon >= TAMIL_NADU_BOUNDS.minLon &&
    lon <= TAMIL_NADU_BOUNDS.maxLon
  );
}

/**
 * Helper to test if a state name belongs to Tamil Nadu or adjacent Puducherry
 */
export function isTamilNaduState(stateName: string): boolean {
  if (!stateName) return false;
  const s = stateName.toLowerCase();
  return (
    s.includes('tamil nadu') ||
    s.includes('tamilnadu') ||
    s.includes('puducherry') ||
    s.includes('pondicherry')
  );
}
