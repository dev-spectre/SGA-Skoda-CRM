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

export function parseBranches(branchStr: string | null | undefined): string[] {
  if (!branchStr) return [];
  const parsed = String(branchStr).split(',').map(b => {
    const clean = b.replace(/[_-]/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!clean) return '';
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }).filter(Boolean);
  return Array.from(new Set(parsed));
}
