import { prisma } from '@/lib/prisma';
import { getSheetData, batchUpdateSheetRows } from '@/lib/google';
import { parsePhoneNumber, sanitizeField, parseSheetStatus, isInvalidPhoneNumber } from '@/lib/utils';
import { getCachedSettings } from '@/lib/settings';

interface ColumnMapping {
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

const DEFAULT_MAPPING: ColumnMapping = {
  name: 0,
  phone: 1,
  city: 2,
  createdAt: 3,
  remark: 4,
  status: 5,
  adname: 6,
  branch: 7,
  followUpDate1: 8,
  followUpDate2: 9,
  platform: 10,
  // testDrive and assignedConsultant are optional CRM fields and must NEVER default to arbitrary column indices!
};

export const KNOWN_CONSULTANT_NAMES = new Set([
  'kishor kumar', 'surya s', 'alfiya', 'ajithesh', 'rajkumar a',
  'sivaprasanth v', 'santhosh', 'palaniyappan s', 'gunaseelan', 'sathish m',
  'simon e', 'sridhaaran', 'suriya s', 'suriya', 'venkatesh', 'ebenezer',
  'santhosh kumar s', 'venkateshwaran', 'rumash', 'arun albert', 'kannan d d',
  'murali', 'janarthanan', 'nawin', 'renu kumar m', 'arun kumar p', 'kiran',
  'rahul', 'satheeshkumar s', 'madhan kumar b', 'arun kumar d k', 'paramasivam',
  'dhanaseelan', 'nithish', 'tarun (ic)'
]);

function isLowQualityLead(name: string, phone: string, city: string): boolean {
  if (!name && !phone) return true;
  if (!phone || phone.length < 5) return true;
  const isJunkText = (val: string) => /^(n\/?a|null|nil|none|test|\.|\-|undefined)$/i.test(val.trim());
  if ((!name || isJunkText(name)) && (!city || isJunkText(city))) return true;
  // Guard against accidental duplicate header rows inside sheet data
  if (/^(full_?name|name|first_?name|phone_?number|customer_?name)$/i.test(name.trim())) return true;
  if (/^(phone_?number|phone|mobile|contact|contact_?no)$/i.test(phone.trim())) return true;
  return false;
}

export async function deduplicateDatabaseLeads() {
  try {
    const { executeDeleteDuplicateLeads } = await import('@/lib/deduplicate');
    const result = await executeDeleteDuplicateLeads();
    return result;
  } catch (err) {
    console.error('Failed to deduplicate database leads:', err);
    return { duplicateCount: 0 };
  }
}

// Cache tracking for sheets to avoid massive repetitive queries and data egress
let cachedSheetHash: string | null = null;
let cachedRowHashes = new Map<number, string>();

export function invalidateSyncCache() {
  cachedSheetHash = null;
  cachedRowHashes.clear();
}

export async function performSheetSync() {
  try {
    const settings = await getCachedSettings();

    if (!settings?.selectedSpreadsheetId || !settings?.selectedSheetName || !settings?.googleAccessToken) {
      return { synced: 0, duplicates: 0, skippedLowQuality: 0, skippedDuplicates: 0, total: 0, error: 'Settings not configured' };
    }

  const parsedMapping: Partial<ColumnMapping> = settings.columnMapping
    ? JSON.parse(settings.columnMapping)
    : {};

  // If custom columnMapping is configured in settings, use ONLY explicitly configured columns.
  // Do NOT blindly spread DEFAULT_MAPPING which introduces phantom assignedConsultant/testDrive column indices!
  const rawMapping: ColumnMapping = settings.columnMapping
    ? (parsedMapping as ColumnMapping)
    : DEFAULT_MAPPING;

  // Collision Guard: Ensure no writable CRM field collides with any source column
  const sourceColIndices = new Map<number, string>();
  if (rawMapping.branch !== undefined && rawMapping.branch >= 0) sourceColIndices.set(rawMapping.branch, 'branch');
  if (rawMapping.name !== undefined && rawMapping.name >= 0) sourceColIndices.set(rawMapping.name, 'name');
  if (rawMapping.phone !== undefined && rawMapping.phone >= 0) sourceColIndices.set(rawMapping.phone, 'phone');
  if (rawMapping.city !== undefined && rawMapping.city >= 0) sourceColIndices.set(rawMapping.city, 'city');
  if (rawMapping.adname !== undefined && rawMapping.adname >= 0) sourceColIndices.set(rawMapping.adname, 'adname');
  if (rawMapping.platform !== undefined && rawMapping.platform >= 0) sourceColIndices.set(rawMapping.platform, 'platform');
  if (rawMapping.createdAt !== undefined && rawMapping.createdAt >= 0) sourceColIndices.set(rawMapping.createdAt, 'createdAt');

  const mapping: ColumnMapping = { ...rawMapping };

  if (mapping.assignedConsultant !== undefined && sourceColIndices.has(mapping.assignedConsultant)) {
    console.warn(`[Sync Guard] assignedConsultant mapped to column ${mapping.assignedConsultant} collides with source '${sourceColIndices.get(mapping.assignedConsultant)}'. Disabling assignedConsultant sheet sync.`);
    delete mapping.assignedConsultant;
  }
  if (mapping.testDrive !== undefined && sourceColIndices.has(mapping.testDrive)) {
    console.warn(`[Sync Guard] testDrive mapped to column ${mapping.testDrive} collides with source '${sourceColIndices.get(mapping.testDrive)}'. Disabling testDrive sheet sync.`);
    delete mapping.testDrive;
  }

  const rows = await getSheetData(settings.selectedSpreadsheetId, settings.selectedSheetName);

  if (!rows || rows.length <= 1) {
    return { synced: 0, duplicates: 0, skippedLowQuality: 0, skippedDuplicates: 0, total: 0 };
  }

  const dataRows = rows.slice(1);
  let synced = 0;
  let duplicates = 0;
  let skippedLowQuality = 0;
  let skippedDuplicates = 0;

  // 1. Fast Sheet & Row Hash Check:
  // If the sheet content has not changed since the last sync, short-circuit immediately!
  // This eliminates 95%+ of all database queries and completely stops massive data egress.
  const currentRowHashes = new Map<number, string>();
  const dirtyRowIndices = new Set<number>();
  let sheetFingerprint = `${dataRows.length}:`;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2;
    const rowHash = row.slice(0, 15).join('│');
    currentRowHashes.set(rowNum, rowHash);

    if (cachedRowHashes.size > 0 && cachedRowHashes.get(rowNum) === rowHash) {
      // Row is completely unchanged and already reconciled in DB
    } else {
      dirtyRowIndices.add(i);
    }
  }

  if (dataRows.length > 0) {
    sheetFingerprint += `${dataRows[0]?.slice(0, 3).join('|')}:${dataRows[dataRows.length - 1]?.slice(0, 3).join('|')}`;
  }

  // If all rows are unchanged and sheet size matches, 0 DB queries needed!
  if (cachedSheetHash && cachedSheetHash === sheetFingerprint && dirtyRowIndices.size === 0) {
    return {
      synced: 0,
      duplicates: dataRows.length,
      skippedLowQuality: 0,
      skippedDuplicates: 0,
      total: dataRows.length,
    };
  }

  // 2. Scan dirty/new sheet rows to collect search keys (phones, fingerprints)
  // Only query candidate phones and fingerprints for rows that actually changed or are new!
  const candidatePhones = new Set<string>();
  const candidateFingerprints = new Set<string>();
  const preScanCounts = new Map<string, number>();

  const isIncremental = cachedRowHashes.size > 0 && dirtyRowIndices.size < dataRows.length;
  const indicesToScan = isIncremental ? Array.from(dirtyRowIndices) : Array.from({ length: dataRows.length }, (_, i) => i);

  for (const i of indicesToScan) {
    const row = dataRows[i];
    const rawPhone = (row[mapping.phone] || '').toString();
    const phone = parsePhoneNumber(rawPhone);
    if (phone) candidatePhones.add(phone);

    const createdAtRaw = (mapping.createdAt !== undefined && mapping.createdAt >= 0 ? (row[mapping.createdAt] || '') : '').toString().trim();
    const baseFp = `${phone}|${createdAtRaw}`;
    const cnt = preScanCounts.get(baseFp) || 0;
    preScanCounts.set(baseFp, cnt + 1);
    candidateFingerprints.add(`${baseFp}|${cnt}`);
  }

  // 3. Fetch only matching DB leads for the candidate keys
  // CRITICAL FIX: candidateRows is REMOVED! sheetRow: { in: candidateRows } was matching the entire database!
  const CHUNK_SIZE = 200;
  const existingLeadsMap = new Map<number, any>();
  const baseSelect = {
    id: true,
    fingerprint: true,
    remark: true,
    status: true,
    name: true,
    phone: true,
    city: true,
    adname: true,
    branch: true,
    followUpDate1: true,
    followUpDate2: true,
    sheetRow: true,
    assignedConsultant: true,
    testDrive: true,
    platform: true,
    source: true,
    uploadedById: true,
    sheetId: true,
    isInvalidPhone: true,
    isBranchManual: true,
    updatedAt: true,
  };

  const phonesArr = Array.from(candidatePhones);
  for (let i = 0; i < phonesArr.length; i += CHUNK_SIZE) {
    const chunk = phonesArr.slice(i, i + CHUNK_SIZE);
    const leads = await prisma.lead.findMany({
      where: { source: { not: 'External Upload' }, uploadedById: null, phone: { in: chunk } },
      select: baseSelect,
    });
    leads.forEach(l => existingLeadsMap.set(l.id, l));
  }

  const fingerprintsArr = Array.from(candidateFingerprints);
  for (let i = 0; i < fingerprintsArr.length; i += CHUNK_SIZE) {
    const chunk = fingerprintsArr.slice(i, i + CHUNK_SIZE);
    const leads = await prisma.lead.findMany({
      where: { source: { not: 'External Upload' }, uploadedById: null, fingerprint: { in: chunk } },
      select: baseSelect,
    });
    leads.forEach(l => existingLeadsMap.set(l.id, l));
  }

  const existingLeads = Array.from(existingLeadsMap.values());

  const existingByFingerprint = new Map<string, typeof existingLeads[0]>();
  const existingByPhone = new Map<string, typeof existingLeads[0]>();
  const claimedDbIds = new Set<number>();

  for (const lead of existingLeads) {
    if (lead.fingerprint && !existingByFingerprint.has(lead.fingerprint)) {
      existingByFingerprint.set(lead.fingerprint, lead);
    }
    const cleanPhone = parsePhoneNumber(lead.phone);
    if (cleanPhone && !existingByPhone.has(cleanPhone)) {
      existingByPhone.set(cleanPhone, lead);
    }
  }

  const fingerprintCounts = new Map<string, number>();
  const seenFullData = new Set<string>();

  const toCreate: any[] = [];
  const toUpdate: { id: number; data: any }[] = [];
  const sheetUpdatesToCorrect: { rowNumber: number; updates: { col: number; value: string }[] }[] = [];

  if (isIncremental) {
    duplicates += (dataRows.length - indicesToScan.length);
  }

  // 2. In-Memory Reconciliation (only process dirty/new rows)
  for (const i of indicesToScan) {
    const row = dataRows[i];
    const rowNumber = i + 2;

    const rawName = (row[mapping.name] || '').toString();
    const rawPhone = (row[mapping.phone] || '').toString();
    const rawCity = mapping.city !== undefined && mapping.city >= 0 ? (row[mapping.city] || '').toString() : '';

    const name = sanitizeField(rawName);
    const phone = parsePhoneNumber(rawPhone);
    const city = sanitizeField(rawCity);

    const rawPlatform = mapping.platform !== undefined && mapping.platform >= 0 ? (row[mapping.platform] || '').toString() : '';
    let platform = sanitizeField(rawPlatform);
    if (platform) {
      platform = platform.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
      const isDateStr = /^\d{4}-\d{2}-\d{2}$/.test(platform) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(platform) || (!isNaN(Date.parse(platform)) && (platform.includes('-') || platform.includes('/')));
      if (isDateStr) {
        platform = 'Unknown';
      }
    } else {
      platform = 'Unknown';
    }
    
    const rawAdname = mapping.adname !== undefined && mapping.adname >= 0 ? (row[mapping.adname] || '').toString() : '';
    const rawBranch = mapping.branch !== undefined && mapping.branch >= 0 ? (row[mapping.branch] || '').toString() : '';
    const rawFollowUpDate1 = mapping.followUpDate1 !== undefined && mapping.followUpDate1 >= 0 ? (row[mapping.followUpDate1] || '').toString() : '';
    const rawFollowUpDate2 = mapping.followUpDate2 !== undefined && mapping.followUpDate2 >= 0 ? (row[mapping.followUpDate2] || '').toString() : '';
    const adname = sanitizeField(rawAdname);
    let branch = sanitizeField(rawBranch);

    // Safeguard: Check if sheet's branch column cell contains a consultant's name
    const isBranchCellConsultantName = KNOWN_CONSULTANT_NAMES.has(branch.toLowerCase().trim());
    let consultantFoundInBranchCol: string | null = null;
    if (isBranchCellConsultantName) {
      consultantFoundInBranchCol = branch;
      branch = ''; // Do NOT save consultant name as branch!
    }

    let followUpDate1: Date | null = null;
    if (rawFollowUpDate1) {
      const parsed = new Date(rawFollowUpDate1);
      if (!isNaN(parsed.getTime())) followUpDate1 = parsed;
    }

    let followUpDate2: Date | null = null;
    if (rawFollowUpDate2) {
      const parsed = new Date(rawFollowUpDate2);
      if (!isNaN(parsed.getTime())) followUpDate2 = parsed;
    }

    if (isLowQualityLead(name, phone, city)) {
      skippedLowQuality++;
      continue;
    }

    const createdAtRaw = (mapping.createdAt !== undefined && mapping.createdAt >= 0 ? (row[mapping.createdAt] || '') : '').toString().trim();
    const remark = (mapping.remark !== undefined && mapping.remark >= 0 ? sanitizeField((row[mapping.remark] || '').toString()) : null) || null;
    const statusRaw = (mapping.status !== undefined && mapping.status >= 0 ? (row[mapping.status] || '').toString() : '').trim().toLowerCase();

    // Deduplicate exact identical rows from the sheet
    const fullDataHash = `${name}|${phone}|${city}|${adname}|${branch}|${createdAtRaw}|${remark || ''}|${statusRaw}|${followUpDate1 ? followUpDate1.getTime() : ''}|${followUpDate2 ? followUpDate2.getTime() : ''}|${platform}`;
    if (seenFullData.has(fullDataHash)) {
      skippedDuplicates++;
      continue;
    }
    seenFullData.add(fullDataHash);

    let createdAt = new Date();
    if (createdAtRaw) {
      const parsed = new Date(createdAtRaw);
      if (!isNaN(parsed.getTime())) {
        createdAt = parsed;
      }
    }

    const status = parseSheetStatus(statusRaw);

    const baseFingerprint = `${phone}|${createdAtRaw}`;
    const count = fingerprintCounts.get(baseFingerprint) || 0;
    fingerprintCounts.set(baseFingerprint, count + 1);

    const fingerprint = `${baseFingerprint}|${count}`;

    // Multi-stage fallback lead matching with strict single-claim isolation:
    // Prevents multiple distinct sheet rows with the same phone from clobbering each other
    let existing: typeof existingLeads[0] | undefined = undefined;

    // 1. Try exact fingerprint match
    if (existingByFingerprint.has(fingerprint)) {
      const cand = existingByFingerprint.get(fingerprint)!;
      if (!claimedDbIds.has(cand.id)) {
        existing = cand;
      }
    }

    // 2. Fallback to phone match ONLY if this DB lead has not already been claimed
    if (!existing && phone && existingByPhone.has(phone)) {
      const cand = existingByPhone.get(phone)!;
      if (!claimedDbIds.has(cand.id)) {
        existing = cand;
      }
    }

    if (existing) {
      claimedDbIds.add(existing.id);
      if (existing.fingerprint) existingByFingerprint.delete(existing.fingerprint);
      if (phone) existingByPhone.delete(phone);

      // Check if Sheet row has mismatched CRM values and queue corrections to write back to Google Sheet
      // STRICT RULE: ONLY remark, followup, status, testdrive, assigned consultant are allowed to be written back to sheets
      const corrections: { col: number; value: string }[] = [];

      // 1. Status Synchronization
      let shouldUpdateStatusFromSheet = false;
      let newStatusFromSheet: string | null = null;

      if (mapping.status !== undefined && mapping.status >= 0) {
        const normExistingStatus = (existing.status === 'created' ? 'not_contacted' : existing.status === 'closed_successful' ? 'live' : existing.status === 'closed_unsuccessful' ? 'lost' : existing.status) || 'not_contacted';
        let formattedDbStatus = 'Not Contacted';
        if (normExistingStatus === 'pending') formattedDbStatus = 'Contacted';
        else if (normExistingStatus === 'live') formattedDbStatus = 'Completed';
        else if (normExistingStatus === 'lost') formattedDbStatus = 'Lost';

        const rawSheetStatusStr = (row[mapping.status] || '').toString().trim();
        const normSheetStatus = parseSheetStatus(rawSheetStatusStr.toLowerCase());

        // Prevent race-condition status reverts by checking if DB was recently updated
        const isRecentlyUpdated = existing.updatedAt && (Date.now() - new Date(existing.updatedAt).getTime() < 60000);

        if (rawSheetStatusStr && normSheetStatus !== normExistingStatus) {
          if (isRecentlyUpdated) {
            // CRM user just modified the lead status recently: push authoritative CRM status to Google Sheet
            corrections.push({ col: mapping.status, value: formattedDbStatus });
          } else {
            // Lead has not been modified in CRM recently: update DB lead status from Google Sheet
            shouldUpdateStatusFromSheet = true;
            newStatusFromSheet = normSheetStatus;
          }
        }
      }

      // 2. Remark Mismatch Correction
      if (mapping.remark !== undefined && mapping.remark >= 0) {
        const rawSheetRemark = (row[mapping.remark] || '').toString();
        const cleanSheetRemark = sanitizeField(rawSheetRemark) || '';
        const dbRemark = existing.remark || '';
        if (existing.remark !== null && existing.remark !== undefined && cleanSheetRemark !== dbRemark) {
          corrections.push({ col: mapping.remark, value: dbRemark });
        }
      }

      // 3. Follow Up Date 1 Mismatch Correction
      if (mapping.followUpDate1 !== undefined && mapping.followUpDate1 >= 0) {
        const dbF1 = existing.followUpDate1 ? existing.followUpDate1.toISOString().split('T')[0] : '';
        const sheetF1 = followUpDate1 ? followUpDate1.toISOString().split('T')[0] : '';
        if (existing.followUpDate1 && dbF1 !== sheetF1) {
          corrections.push({ col: mapping.followUpDate1, value: dbF1 });
        }
      }

      // 4. Follow Up Date 2 Mismatch Correction
      if (mapping.followUpDate2 !== undefined && mapping.followUpDate2 >= 0) {
        const dbF2 = existing.followUpDate2 ? existing.followUpDate2.toISOString().split('T')[0] : '';
        const sheetF2 = followUpDate2 ? followUpDate2.toISOString().split('T')[0] : '';
        if (existing.followUpDate2 && dbF2 !== sheetF2) {
          corrections.push({ col: mapping.followUpDate2, value: dbF2 });
        }
      }

      // 5. Test Drive Mismatch Correction (NEVER write to a source column like branch/platform)
      if (mapping.testDrive !== undefined && mapping.testDrive >= 0 && !sourceColIndices.has(mapping.testDrive)) {
        const rawSheetTd = (row[mapping.testDrive] || '').toString().trim();
        const dbTd = (existing.testDrive || '').trim();
        if (existing.testDrive !== null && existing.testDrive !== undefined && rawSheetTd !== dbTd) {
          corrections.push({ col: mapping.testDrive, value: dbTd });
        }
      }

      // 6. Assigned Consultant Mismatch Correction (NEVER write to a source column like branch!)
      if (mapping.assignedConsultant !== undefined && mapping.assignedConsultant >= 0 && !sourceColIndices.has(mapping.assignedConsultant)) {
        const rawSheetCons = (row[mapping.assignedConsultant] || '').toString().trim();
        const dbCons = (existing.assignedConsultant || '').trim();
        if (existing.assignedConsultant !== null && existing.assignedConsultant !== undefined && rawSheetCons !== dbCons) {
          corrections.push({ col: mapping.assignedConsultant, value: dbCons });
        }
      }

      if (corrections.length > 0 && rowNumber) {
        sheetUpdatesToCorrect.push({ rowNumber, updates: corrections });
      }

      // Only queue DB update if metadata or status changed from sheet, preserving DB CRM fields
      const hasMetadataChanged = (
        shouldUpdateStatusFromSheet ||
        existing.name !== name ||
        existing.phone !== phone ||
        existing.city !== city ||
        existing.adname !== adname ||
        (!isBranchCellConsultantName && branch && existing.branch !== branch) ||
        (isBranchCellConsultantName && consultantFoundInBranchCol && !existing.assignedConsultant) ||
        existing.platform !== platform ||
        existing.sheetRow !== rowNumber ||
        existing.sheetId !== settings.selectedSpreadsheetId
      );

      if (hasMetadataChanged) {
        const updatePayload: any = {
          name,
          phone,
          city,
          adname,
          platform,
          sheetRow: rowNumber,
          sheetId: settings.selectedSpreadsheetId,
          fingerprint,
          isInvalidPhone: isInvalidPhoneNumber(phone),
        };

        if (shouldUpdateStatusFromSheet && newStatusFromSheet) {
          updatePayload.status = newStatusFromSheet;
        }

        // If sheet's branch cell contained a consultant name, safely attribute it to assignedConsultant
        if (isBranchCellConsultantName && consultantFoundInBranchCol) {
          if (!existing.assignedConsultant) {
            updatePayload.assignedConsultant = consultantFoundInBranchCol;
          }
        } else if (!isBranchCellConsultantName && branch) {
          updatePayload.branch = branch;
        }

        toUpdate.push({
          id: existing.id,
          data: updatePayload,
        });
      }
      duplicates++;
    } else {
      toCreate.push({
        name,
        phone,
        city,
        adname,
        branch: isBranchCellConsultantName ? '' : branch,
        assignedConsultant: isBranchCellConsultantName ? consultantFoundInBranchCol : null,
        followUpDate1,
        followUpDate2,
        createdAt,
        remark,
        status,
        platform,
        sheetRow: rowNumber,
        sheetId: settings.selectedSpreadsheetId,
        source: 'System',
        uploadedById: null,
        fingerprint,
        isInvalidPhone: isInvalidPhoneNumber(phone),
        isBranchManual: false,
      });
      synced++;
    }
  }

  // 3. Execute Bulk DB Operations
  // Create New Leads with DB-level duplicate skipping
  if (toCreate.length > 0) {
    await prisma.lead.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  // Update Existing Leads only when metadata changed
  for (let i = 0; i < toUpdate.length; i += 50) {
    const chunk = toUpdate.slice(i, i + 50);
    await Promise.all(
      chunk.map(u =>
        prisma.lead.update({
          where: { id: u.id },
          data: u.data
        }).catch(e => {
          console.error(`Update failed for id ${u.id}:`, e);
        })
      )
    );
  }

  // 4. Correct Mismatched Google Sheet Rows to Match Authoritative DB Data (Single Bulk API Request)
  if (sheetUpdatesToCorrect.length > 0 && settings.selectedSpreadsheetId && settings.selectedSheetName) {
    try {
      await batchUpdateSheetRows(
        settings.selectedSpreadsheetId,
        settings.selectedSheetName,
        sheetUpdatesToCorrect.map(c => ({ row: c.rowNumber, colValues: c.updates }))
      );
    } catch (sheetErr) {
      console.error('Failed to batch-correct mismatched Google Sheet rows:', sheetErr);
    }
  }

  // 4. Preserve All Database Leads
  // Leads removed or missing from the Google Sheet are preserved in the database and visible in dashboard.

  await prisma.settings.update({
    where: { id: 1 },
    data: { lastSyncAt: new Date() },
  });

  // Update in-memory differential cache after successful sync
  cachedRowHashes = currentRowHashes;
  cachedSheetHash = sheetFingerprint;

    return {
      synced,
      duplicates,
      skippedLowQuality,
      skippedDuplicates,
      total: dataRows.length,
    };
  } catch (err: any) {
    const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    const isSessionExpired = err?.isSessionExpired || 
      errMsg.includes('invalid_grant') || 
      errMsg.includes('Google session expired') || 
      errMsg.includes('Token has been expired or revoked');

    if (isSessionExpired) {
      console.error('Sheet Sync Failed: Google session expired');
      return { 
        synced: 0, 
        duplicates: 0, 
        skippedLowQuality: 0, 
        skippedDuplicates: 0, 
        total: 0, 
        error: 'Google session expired (invalid grant). Please reconnect your Google account in Settings.',
        isSessionExpired: true 
      };
    }
    console.error('Auto background sheet sync error:', errMsg);
    return { synced: 0, duplicates: 0, skippedLowQuality: 0, skippedDuplicates: 0, total: 0, error: errMsg };
  }
}

export async function clearAndResyncDatabase() {
  invalidateSyncCache();
  await prisma.lead.deleteMany({
    where: {
      source: { not: 'External Upload' },
      uploadedById: null,
    },
  });
  console.log('🧹 Purged sheet leads database data (preserved external uploads).');
  return await performSheetSync();
}
