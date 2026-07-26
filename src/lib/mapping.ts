import { getSheetData, updateSheetRow } from './google';

export interface ColumnMapping {
  name: number;
  phone: number;
  email: number;
  city: number;
  zipCode: number;
  platform: number;
  createdAt: number;
  remark: number;
  status: number;
}

export async function computeIntelligentMapping(
  spreadsheetId: string,
  sheetName: string
): Promise<ColumnMapping> {
  const rows = await getSheetData(spreadsheetId, sheetName);
  
  if (!rows || rows.length === 0) {
    throw new Error('Sheet is empty');
  }

  const headers = (rows[0] || []).map((h: any) => String(h).toLowerCase().trim());
  let maxColIndex = headers.length - 1;

  // Find max col index from data rows as well in case headers are sparse
  for (let i = 1; i < Math.min(10, rows.length); i++) {
    if (rows[i].length - 1 > maxColIndex) {
      maxColIndex = rows[i].length - 1;
    }
  }

  const mapping: Partial<Record<keyof ColumnMapping, number>> = {};

  const regexMap: Record<keyof ColumnMapping, RegExp[]> = {
    name: [/^full\s?_?name$/i, /^first\s?_?name$/i, /^name$/i, /client\s?_?name/i, /lead\s?_?name/i, /name/i],
    phone: [/^phone$/i, /^mobile$/i, /^contact\s?_?no/i, /phone|mobile|contact|cell|number/i],
    email: [/^email$/i, /^e-?mail\s?address$/i, /email|mail/i],
    city: [/^city$/i, /^location$/i, /city|location|town/i],
    zipCode: [/^zip\s?_?code$/i, /^pin\s?_?code$/i, /zip|pin|postal/i],
    platform: [/^platform$/i, /^source$/i, /platform|source|medium|campaign/i],
    createdAt: [/^created\s?_?at$/i, /^date$/i, /^timestamp$/i, /date|time|created/i],
    remark: [/^remark$/i, /^notes?$/i, /^comments?$/i, /remark|notes|comments/i],
    status: [/^status$/i, /^state$/i, /status|state/i],
  };

  // Phase 1: Header Matching with Priority
  for (const [field, regexes] of Object.entries(regexMap)) {
    const key = field as keyof ColumnMapping;
    for (const regex of regexes) {
      const matchIndex = headers.findIndex((h) => regex.test(h));
      // Avoid matching "ad_name" or "campaign_name" with the generic /name/i fallback if we can help it, 
      // but since it's the last in the array, it will only be used if nothing else matches.
      // However, explicitly reject 'ad_name' or 'campaign_name' for the 'name' field
      if (matchIndex !== -1) {
        if (key === 'name' && /ad_name|campaign_name|ad name|campaign name/i.test(headers[matchIndex])) {
          continue; // skip this match and keep trying
        }
        mapping[key] = matchIndex;
        break;
      }
    }
  }

  // Phase 2: Data Sniffing for missing core fields
  const dataRows = rows.slice(1, 10);
  
  if (mapping.phone === undefined) {
    for (let c = 0; c <= maxColIndex; c++) {
      if (Object.values(mapping).includes(c)) continue;
      const isPhone = dataRows.some(row => {
        const val = String(row[c] || '').replace(/\D/g, '');
        return val.length >= 10 && val.length <= 15;
      });
      if (isPhone) { mapping.phone = c; break; }
    }
  }

  if (mapping.zipCode === undefined) {
    for (let c = 0; c <= maxColIndex; c++) {
      if (Object.values(mapping).includes(c)) continue;
      const isZip = dataRows.some(row => {
        const val = String(row[c] || '').trim();
        return /^\d{5,6}$/.test(val);
      });
      if (isZip) { mapping.zipCode = c; break; }
    }
  }

  if (mapping.createdAt === undefined) {
    for (let c = 0; c <= maxColIndex; c++) {
      if (Object.values(mapping).includes(c)) continue;
      const isDate = dataRows.some(row => {
        const val = String(row[c] || '').trim();
        return val && !isNaN(new Date(val).getTime()) && val.includes('-');
      });
      if (isDate) { mapping.createdAt = c; break; }
    }
  }

  // Phase 3: Fallbacks and free column assignment for remark/status
  const missingHeaders: { col: number; value: string }[] = [];

  const assignFreeColumn = (key: keyof ColumnMapping, headerLabel: string) => {
    if (mapping[key] === undefined) {
      maxColIndex++;
      mapping[key] = maxColIndex;
      missingHeaders.push({ col: maxColIndex, value: headerLabel });
    }
  };

  if (mapping.name === undefined) mapping.name = 0;
  if (mapping.phone === undefined) mapping.phone = 1;
  if (mapping.email === undefined) mapping.email = 2;
  if (mapping.city === undefined) assignFreeColumn('city', 'City');
  if (mapping.zipCode === undefined) assignFreeColumn('zipCode', 'Zip Code');
  if (mapping.platform === undefined) assignFreeColumn('platform', 'Platform');
  if (mapping.createdAt === undefined) assignFreeColumn('createdAt', 'Created At');
  
  assignFreeColumn('remark', 'Remark');
  assignFreeColumn('status', 'Status');

  // Write new headers back to sheet if we allocated free columns
  if (missingHeaders.length > 0) {
    try {
      await updateSheetRow(spreadsheetId, sheetName, 1, missingHeaders);
    } catch (e) {
      console.error('Failed to write missing headers to sheet', e);
    }
  }

  return mapping as ColumnMapping;
}
