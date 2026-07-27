export function parsePhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  
  let cleaned = String(rawPhone).trim();
  
  // Handle dummy placeholder strings
  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).replace(/^test lead:\s*/i, '').replace(/dummy data for\s*/i, '').trim();
  }
  
  if (cleaned.toLowerCase().includes('dummy') || cleaned.toLowerCase().includes('test lead')) {
    return 'Test Lead Phone';
  }
  
  // Remove Meta Ads "p:" prefix
  cleaned = cleaned.replace(/^p:\s*/i, '').trim();
  
  // Extract digits
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  // 12 digits starting with 91 (e.g. 919876543210 -> 9876543210)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly.slice(2);
  }
  
  // 11 digits starting with 0 (e.g. 09876543210 -> 9876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return digitsOnly.slice(1);
  }
  
  // Standard 10 digits
  if (digitsOnly.length === 10) {
    return digitsOnly;
  }
  
  // 10+ digits starting with 91
  if (digitsOnly.length > 10 && digitsOnly.startsWith('91')) {
    const withoutCC = digitsOnly.slice(2);
    if (withoutCC.length >= 10) {
      return withoutCC.slice(-10);
    }
  }

  return digitsOnly.length >= 10 ? digitsOnly.slice(-10) : (digitsOnly || cleaned);
}

export function sanitizeField(rawVal: string | null | undefined): string {
  if (!rawVal) return '';
  let str = String(rawVal).trim();
  if (str.startsWith('<') && str.endsWith('>')) {
    str = str.substring(1, str.length - 1).replace(/^test lead:\s*/i, '').replace(/dummy data for\s*/i, '').trim();
  }
  return str;
}

export function parseZipCode(rawZip: string | null | undefined): string {
  if (!rawZip) return '';
  const str = String(rawZip).trim();
  
  // Match Indian PIN code (6 digits, optional space in middle)
  const pinMatch = str.match(/(?<!\d)(\d{3})\s?(\d{3})(?!\d)/);
  if (pinMatch) {
    return pinMatch[1] + pinMatch[2];
  }
  
  // Match US/International standard zip (5 digits, optional -4 extension)
  const usMatch = str.match(/(?<!\d)\d{5}(?:-\d{4})?(?!\d)/);
  if (usMatch) {
    return usMatch[0];
  }
  
  // Fallback: remove all non-digits, return first 5-6 digits if exists
  const digits = str.replace(/\D/g, '');
  const fallback = digits.match(/\d{5,6}/);
  if (fallback) {
    return fallback[0];
  }
  
  return str;
}

// Distance calculation using Haversine formula
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// In-memory cache to prevent Nominatim rate-limiting for repeated zipcodes/cities
const globalForCache = globalThis as unknown as {
  geocodeCache: Map<string, { lat: number; lng: number } | null> | undefined;
};
const geocodeCache = globalForCache.geocodeCache ?? new Map<string, { lat: number; lng: number } | null>();
if (process.env.NODE_ENV !== 'production') globalForCache.geocodeCache = geocodeCache;

export async function geocodeAddress(city: string, zipCode: string): Promise<{ lat: number; lng: number } | null> {
  if (!city && !zipCode) return null;
  
  const query = [city, zipCode].filter(Boolean).join(', ');
  if (!query) return null;
  
  const cacheKey = query.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  try {
    // Respect Nominatim rate limit (1 request per second)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SGA-Skoda-CRM/1.0',
      },
    });
    
    if (!res.ok) {
      console.warn(`Geocoding failed for ${query} with status: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    if (data && data.length > 0) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      geocodeCache.set(cacheKey, result);
      return result;
    }
    
    geocodeCache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.error('Geocoding error:', err);
    return null;
  }
}
