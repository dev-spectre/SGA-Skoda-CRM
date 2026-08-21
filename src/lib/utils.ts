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
  const hasPlus = cleaned.startsWith('+');
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  // Standard 10 digits
  if (digitsOnly.length === 10) {
    return digitsOnly;
  }
  
  // 11 digits starting with 0 (e.g. 09876543210 -> 9876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return digitsOnly.slice(1);
  }
  
  // 12 digits starting with 91 (e.g. 919876543210 -> 9876543210)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly.slice(2);
  }

  // 13+ digits starting with 0091 (e.g. 00919876543210 -> 9876543210)
  if (digitsOnly.length === 14 && digitsOnly.startsWith('0091')) {
    return digitsOnly.slice(4);
  }
  
  // For other lengths (like >15 digits or international numbers), return the full cleaned number
  // If it originally had a '+', keep it to indicate it's an international number
  if (digitsOnly.length > 10) {
    return hasPlus ? '+' + digitsOnly : digitsOnly;
  }

  return digitsOnly || cleaned;
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
    return clean.split(' ').map(w => {
      if (w.toLowerCase() === 'mtp') return 'MTP';
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }).filter(Boolean);
  return Array.from(new Set(parsed));
}

export function parseSheetStatus(rawStatusStr: string | null | undefined): 'not_contacted' | 'pending' | 'live' | 'lost' {
  if (!rawStatusStr) return 'not_contacted';

  const norm = String(rawStatusStr).toLowerCase().replace(/[\s_]+/g, '').trim();
  if (!norm) return 'not_contacted';

  // 1. created / CREATED / not contacted -> not contacted ('not_contacted' in DB)
  if (
    norm === 'created' ||
    norm === 'notcontacted' ||
    norm === 'new'
  ) {
    return 'not_contacted';
  }

  // 2. completed / COMPLETED -> completed ('live' in DB)
  if (
    norm === 'completed' ||
    norm === 'won' ||
    norm === 'closedsuccessful' ||
    norm === 'closed' ||
    norm === 'booked' ||
    norm === 'done'
  ) {
    return 'live';
  }

  // 3. lost lead / LOST LEAD / lost -> lost ('lost' in DB)
  if (
    norm.includes('lost') ||
    norm === 'dead' ||
    norm === 'cancelled' ||
    norm === 'canceled' ||
    norm === 'closedunsuccessful' ||
    norm === 'drop'
  ) {
    return 'lost';
  }

  // 4. live lead / LIVE LEAD / contacted -> contacted ('pending' in DB)
  if (
    norm.includes('live') ||
    norm.includes('contacted') ||
    norm.includes('pending') ||
    norm.includes('follow') ||
    norm.includes('warm') ||
    norm.includes('hot')
  ) {
    return 'pending';
  }

  return 'not_contacted';
}

