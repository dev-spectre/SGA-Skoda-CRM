import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/google';
import { parsePhoneNumber, sanitizeField } from '@/lib/utils';

interface ColumnMapping {
  name: number;
  phone: number;
  email?: number;
  city: number;
  adname?: number;
  branch?: number;
  followUpDate1?: number;
  followUpDate2?: number;
  createdAt: number;
  remark: number;
  status: number;
  platform?: number;
}

const DEFAULT_MAPPING: ColumnMapping = {
  name: 0,
  phone: 1,
  email: 2,
  city: 3,
  createdAt: 4,
  remark: 5,
  status: 6,
  adname: 7,
  branch: 8,
  followUpDate1: 9,
  followUpDate2: 10,
  platform: 11,
};

function isLowQualityLead(name: string, phone: string, email: string, city: string): boolean {
  const hasName = name.trim().length > 0;
  const hasPhone = phone.trim().length > 0;
  const hasEmail = email.trim().length > 0;
  const hasCity = city.trim().length > 0;
  return !hasName && !hasPhone && !hasEmail && !hasCity;
}

export async function deduplicateDatabaseLeads() {
  try {
    const { executeDeleteDuplicateLeads } = await import('@/lib/deduplicate');
    const result = await executeDeleteDuplicateLeads();
    console.log(`🧹 Deduplicated ${result.duplicateCount} duplicate entries in database.`);
    return result;
  } catch (err) {
    console.error('Failed to deduplicate database leads:', err);
    return { duplicateCount: 0 };
  }
}

export async function performSheetSync() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });

    if (!settings?.selectedSpreadsheetId || !settings?.selectedSheetName || !settings?.googleAccessToken) {
      return { synced: 0, duplicates: 0, skippedLowQuality: 0, skippedDuplicates: 0, total: 0, error: 'Settings not configured' };
    }

  const mapping: ColumnMapping = settings.columnMapping
    ? { ...DEFAULT_MAPPING, ...JSON.parse(settings.columnMapping) }
    : DEFAULT_MAPPING;

  const rows = await getSheetData(settings.selectedSpreadsheetId, settings.selectedSheetName);

  if (!rows || rows.length <= 1) {
    return { synced: 0, duplicates: 0, skippedLowQuality: 0, skippedDuplicates: 0, total: 0 };
  }

  const dataRows = rows.slice(1);
  let synced = 0;
  let duplicates = 0;
  let skippedLowQuality = 0;
  let skippedDuplicates = 0;

  // 1. Fetch DB State in Bulk (Only query system/sheet leads, never external uploads)
  const existingLeads = await prisma.lead.findMany({
    where: {
      source: { not: 'External Upload' },
      uploadedById: null,
    },
    select: {
      id: true,
      fingerprint: true,
      remark: true,
      status: true,
      name: true,
      phone: true,
      email: true,
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
    },
  });

  const existingByFingerprint = new Map<string, typeof existingLeads[0]>();
  const existingByPhone = new Map<string, typeof existingLeads[0]>();
  const existingByRow = new Map<number, typeof existingLeads[0]>();
  const activeDbIds = new Set<number>();

  for (const lead of existingLeads) {
    if (lead.fingerprint && !existingByFingerprint.has(lead.fingerprint)) {
      existingByFingerprint.set(lead.fingerprint, lead);
    }
    const cleanPhone = parsePhoneNumber(lead.phone);
    if (cleanPhone && !existingByPhone.has(cleanPhone)) {
      existingByPhone.set(cleanPhone, lead);
    }
    if (lead.sheetRow && !existingByRow.has(lead.sheetRow)) {
      existingByRow.set(lead.sheetRow, lead);
    }
  }

  const fingerprintCounts = new Map<string, number>();
  const seenFullData = new Set<string>();
  const currentSheetPhones = new Set<string>();

  const toCreate: any[] = [];
  const toUpdate: { id: number; data: any }[] = [];

  // 2. In-Memory Reconciliation
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;

    const rawName = (row[mapping.name] || '').toString();
    const rawPhone = (row[mapping.phone] || '').toString();
    const rawEmail = mapping.email !== undefined ? (row[mapping.email] || '').toString() : '';
    const rawCity = (row[mapping.city] || '').toString();

    const name = sanitizeField(rawName);
    const phone = parsePhoneNumber(rawPhone);
    const email = sanitizeField(rawEmail);
    const city = sanitizeField(rawCity);

    const rawPlatform = mapping.platform !== undefined ? (row[mapping.platform] || '').toString() : '';
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
    
    const rawAdname = mapping.adname !== undefined ? (row[mapping.adname] || '').toString() : '';
    const rawBranch = mapping.branch !== undefined ? (row[mapping.branch] || '').toString() : '';
    const rawFollowUpDate1 = mapping.followUpDate1 !== undefined ? (row[mapping.followUpDate1] || '').toString() : '';
    const rawFollowUpDate2 = mapping.followUpDate2 !== undefined ? (row[mapping.followUpDate2] || '').toString() : '';
    const adname = sanitizeField(rawAdname);
    const branch = sanitizeField(rawBranch);

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

    if (phone) {
      currentSheetPhones.add(phone);
    }

    if (isLowQualityLead(name, phone, email, city)) {
      skippedLowQuality++;
      continue;
    }

    const createdAtRaw = (row[mapping.createdAt] || '').toString().trim();
    const remark = sanitizeField((row[mapping.remark] || '').toString()) || null;
    const statusRaw = (row[mapping.status] || '').toString().trim().toLowerCase();

    // Deduplicate exact identical rows from the sheet
    const fullDataHash = `${name}|${phone}|${email}|${city}|${adname}|${branch}|${createdAtRaw}|${remark || ''}|${statusRaw}|${followUpDate1 ? followUpDate1.getTime() : ''}|${followUpDate2 ? followUpDate2.getTime() : ''}|${platform}`;
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

    let status = 'not_contacted';
    if (statusRaw.includes('pending') || statusRaw.includes('contacted') || statusRaw.includes('follow')) {
      status = 'pending';
    } else if (statusRaw.includes('live') || statusRaw.includes('successful') || statusRaw === 'closed_successful' || statusRaw === 'closed' || statusRaw.includes('completed')) {
      status = 'live';
    } else if (statusRaw.includes('lost') || statusRaw.includes('unsuccessful') || statusRaw === 'closed_unsuccessful') {
      status = 'lost';
    } else if (statusRaw.includes('not_contacted') || statusRaw.includes('not contacted') || statusRaw === 'created') {
      status = 'not_contacted';
    }

    const baseFingerprint = `${phone}|${createdAtRaw}`;
    const count = fingerprintCounts.get(baseFingerprint) || 0;
    fingerprintCounts.set(baseFingerprint, count + 1);

    const fingerprint = `${baseFingerprint}|${count}`;

    // Multi-stage fallback lead matching
    let existing = existingByFingerprint.get(fingerprint);
    if (!existing && phone) {
      existing = existingByPhone.get(phone);
    }
    if (!existing && rowNumber) {
      existing = existingByRow.get(rowNumber);
    }

    if (existing) {
      activeDbIds.add(existing.id);

      // Prioritize an intentional empty string in the DB over the sheet's remark
      const finalRemark = existing.remark === "" ? "" : (remark || existing.remark);
      
      const normalizedExistingStatus = existing.status === 'created' ? 'not_contacted' : existing.status === 'closed_successful' ? 'live' : existing.status === 'closed_unsuccessful' ? 'lost' : existing.status;
      const finalStatus = normalizedExistingStatus || status || 'not_contacted';

      // Only queue DB update if data actually changed
      if (
        existing.name !== name ||
        existing.phone !== phone ||
        existing.email !== email ||
        existing.city !== city ||
        existing.adname !== adname ||
        existing.branch !== branch ||
        existing.followUpDate1?.getTime() !== followUpDate1?.getTime() ||
        existing.followUpDate2?.getTime() !== followUpDate2?.getTime() ||
        existing.remark !== finalRemark ||
        existing.status !== finalStatus ||
        existing.platform !== platform ||
        existing.sheetRow !== rowNumber
      ) {
        toUpdate.push({
          id: existing.id,
          data: {
            name,
            phone,
            email,
            city,
            adname,
            branch,
            followUpDate1,
            followUpDate2,
            remark: finalRemark,
            status: finalStatus,
            platform,
            sheetRow: rowNumber,
            sheetId: settings.selectedSpreadsheetId,
            fingerprint,
          }
        });
      }
      duplicates++;
    } else {
      toCreate.push({
        name,
        phone,
        email,
        city,
        adname,
        branch,
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
      });
      synced++;
    }
  }

  // 3. Execute Bulk DB Operations
  // Create New Leads with DB-level duplicate skipping using upsert
  const chunkSize = 50;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);
    const createPromises = chunk.map(data => 
      prisma.lead.upsert({
        where: { fingerprint: data.fingerprint },
        update: data,
        create: data
      }).catch(e => {
        console.error(`Create/Upsert failed for fingerprint ${data.fingerprint}:`, e);
      })
    );
    await Promise.all(createPromises);
  }

  // Update Existing Leads in chunks of 50 concurrent updates
  for (let i = 0; i < toUpdate.length; i += 50) {
    const updatePromises = toUpdate.slice(i, i + 50).map(u =>
      prisma.lead.update({
        where: { id: u.id },
        data: u.data
      }).catch(e => {
        console.error(`Update failed for id ${u.id}:`, e);
      })
    );
    await Promise.all(updatePromises);
  }

  // 4. Preserve All Database Leads
  // Leads removed or missing from the Google Sheet are preserved in the database and visible in dashboard.

  await prisma.settings.update({
    where: { id: 1 },
    data: { lastSyncAt: new Date() },
  });

    return {
      synced,
      duplicates,
      skippedLowQuality,
      skippedDuplicates,
      total: dataRows.length,
    };
  } catch (err: any) {
    console.error('Auto background sheet sync error:', err?.message || err);
    return { synced: 0, duplicates: 0, skippedLowQuality: 0, skippedDuplicates: 0, total: 0, error: err?.message || String(err) };
  }
}

export async function clearAndResyncDatabase() {
  await prisma.lead.deleteMany({
    where: {
      source: { not: 'External Upload' },
      uploadedById: null,
    },
  });
  console.log('🧹 Purged sheet leads database data (preserved external uploads).');
  return await performSheetSync();
}
