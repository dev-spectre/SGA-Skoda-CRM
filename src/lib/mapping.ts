import { getSheetData, updateSheetRow } from './google';

export interface ColumnMapping {
  name: number;
  phone: number;
  city?: number;
  adname?: number;
  branch?: number;
  followUpDate1?: number;
  followUpDate2?: number;
  createdAt?: number;
  remark?: number;
  status?: number;
  platform?: number;
  testDrive?: number;
  assignedConsultant?: number;
}

export async function computeIntelligentMapping(
  spreadsheetId: string,
  sheetName: string
): Promise<ColumnMapping> {
  const rows = await getSheetData(spreadsheetId, sheetName);
  
  if (!rows || rows.length === 0) {
    throw new Error('Sheet is empty');
  }

  const headers = (rows[0] || []).map((h: unknown) => String(h).toLowerCase().trim());
  let maxColIndex = headers.length - 1;

  // Find max col index from data rows as well in case headers are sparse
  for (let i = 1; i < Math.min(10, rows.length); i++) {
    if (rows[i].length - 1 > maxColIndex) {
      maxColIndex = rows[i].length - 1;
    }
  }

  const dataRows = rows.slice(1, 10);
  const mapping: Partial<Record<keyof ColumnMapping, number>> = {};

  const regexMap: Record<keyof ColumnMapping, RegExp[]> = {
    name: [/^full\s?_?name$/i, /^first\s?_?name$/i, /^name$/i, /client\s?_?name/i, /lead\s?_?name/i, /name/i],
    phone: [/^phone$/i, /^mobile$/i, /^contact\s?_?no/i, /phone|mobile|contact|cell|number/i],
    city: [/^city$/i, /^location$/i, /city|location|town/i],
    adname: [/^ad\s?_?name$/i, /^campaign\s?_?name$/i, /ad\s?name|campaign\s?name/i],
    branch: [/^branch$/i, /^office$/i, /branch|office/i],
    platform: [/^platform$/i, /^source\s?_?platform$/i, /^lead\s?_?platform$/i, /^source$/i, /^publisher$/i, /^channel$/i, /platform|source|publisher|channel|meta|facebook|ig|instagram|google/i],
    followUpDate1: [/^follow\s?up\s?date\s?1$/i, /^follow\s?up\s?1$/i, /follow up 1|date 1/i],
    followUpDate2: [/^follow\s?up\s?date\s?2$/i, /^follow\s?up\s?2$/i, /follow up 2|date 2/i],
    createdAt: [/^created\s?_?at$/i, /^date$/i, /^timestamp$/i, /date|time|created/i],
    remark: [/^remark$/i, /^notes?$/i, /^comments?$/i, /remark|notes|comments/i],
    status: [/^status$/i, /^state$/i, /status|state/i],
    testDrive: [/^test\s?_?drive$/i, /^td$/i, /test\s?drive|td/i],
    assignedConsultant: [/^assigned\s?_?consultant$/i, /^consultant$/i, /^sales\s?_?consultant$/i, /^sc$/i, /consultant|sales\s?person|advisor/i],
  };

  const usedIndices = new Set<number>();

  // Phase 1: Header Matching with Priority
  for (const [field, regexes] of Object.entries(regexMap)) {
    const key = field as keyof ColumnMapping;
    for (const regex of regexes) {
      const matchIndex = headers.findIndex((h: string, idx: number) => !usedIndices.has(idx) && regex.test(h));
      if (matchIndex !== -1) {
        if (key === 'name' && /ad_name|campaign_name|ad name|campaign name/i.test(headers[matchIndex])) {
          continue; // skip this match and keep trying
        }
        if (key === 'branch' && /consultant|sales\s?person|advisor/i.test(headers[matchIndex])) {
          continue;
        }
        if (key === 'assignedConsultant' && /branch|showroom|outlet|office|dealer/i.test(headers[matchIndex])) {
          continue;
        }
        if (key === 'platform') {
          // Check if data rows in this column look like dates
          const looksLikeDate = dataRows.some((row: unknown[]) => {
            const val = String((row as unknown[])[matchIndex] || '').trim();
            return val && !isNaN(Date.parse(val)) && (val.includes('-') || val.includes('/'));
          });
          if (looksLikeDate) {
            continue; // Skip this column for platform mapping
          }
        }
        mapping[key] = matchIndex;
        usedIndices.add(matchIndex);
        break;
      }
    }
  }

  // Phase 2: Data Sniffing for missing core fields
  if (mapping.phone === undefined) {
    for (let c = 0; c <= maxColIndex; c++) {
      if (usedIndices.has(c)) continue;
      const isPhone = dataRows.some((row: unknown[]) => {
        const val = String((row as unknown[])[c] || '').replace(/\D/g, '');
        return val.length >= 10 && val.length <= 15;
      });
      if (isPhone) { mapping.phone = c; usedIndices.add(c); break; }
    }
  }

  if (mapping.createdAt === undefined) {
    for (let c = 0; c <= maxColIndex; c++) {
      if (usedIndices.has(c)) continue;
      const isDate = dataRows.some((row: unknown[]) => {
        const val = String((row as unknown[])[c] || '').trim();
        return val && !isNaN(new Date(val).getTime()) && val.includes('-');
      });
      if (isDate) { mapping.createdAt = c; usedIndices.add(c); break; }
    }
  }

  if (mapping.platform === undefined) {
    for (let c = 0; c <= maxColIndex; c++) {
      if (usedIndices.has(c)) continue;
      // Skip columns that contain date-like strings
      const containsDates = dataRows.some((row: unknown[]) => {
        const val = String((row as unknown[])[c] || '').trim();
        return val && !isNaN(Date.parse(val)) && (val.includes('-') || val.includes('/'));
      });
      if (containsDates) continue;

      const isPlatform = dataRows.some((row: unknown[]) => {
        const val = String((row as unknown[])[c] || '').trim().toLowerCase();
        return (
          val.includes('meta') ||
          val.includes('facebook') ||
          val.includes('instagram') ||
          val.includes('google') ||
          val.includes('whatsapp') ||
          val.includes('website') ||
          val.includes('chatbot') ||
          val === 'fb' ||
          val === 'ig' ||
          val.includes('ads')
        );
      });
      if (isPlatform) { mapping.platform = c; usedIndices.add(c); break; }
    }
  }

  // Phase 3: Only assign free columns for CRM-managed columns (remark, status) if completely unmapped
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
  
  if (mapping.remark === undefined) assignFreeColumn('remark', 'Remark');
  if (mapping.status === undefined) assignFreeColumn('status', 'Status');

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
