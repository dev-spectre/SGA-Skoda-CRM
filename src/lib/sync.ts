import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/google';
import { parsePhoneNumber, sanitizeField, parseZipCode } from '@/lib/utils';

interface ColumnMapping {
  name: number;
  phone: number;
  email?: number;
  city: number;
  zipCode: number;
  platform: number;
  createdAt: number;
  remark: number;
  status: number;
  branch?: number;
}

const DEFAULT_MAPPING: ColumnMapping = {
  name: 0,
  phone: 1,
  email: 2,
  city: 3,
  zipCode: 4,
  platform: 5,
  createdAt: 6,
  remark: 7,
  status: 8,
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
    const allLeads = await prisma.lead.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    const seenIdenticalLeads = new Set<string>();
    const duplicateIdsToDelete: number[] = [];

    for (const lead of allLeads) {
      const cleanPhone = parsePhoneNumber(lead.phone);
      const cleanName = (lead.name || '').trim().toLowerCase();
      const cleanEmail = (lead.email || '').trim().toLowerCase();
      const cleanCity = (lead.city || '').trim().toLowerCase();
      const cleanZip = (lead.zipCode || '').trim().toLowerCase();
      const cleanPlatform = (lead.platform || '').trim().toLowerCase();

      // Fingerprint of all core lead columns
      const leadFingerprint = `${cleanName}|${cleanPhone}|${cleanEmail}|${cleanCity}|${cleanZip}|${cleanPlatform}`;

      if (seenIdenticalLeads.has(leadFingerprint)) {
        duplicateIdsToDelete.push(lead.id);
      } else {
        seenIdenticalLeads.add(leadFingerprint);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: duplicateIdsToDelete } },
      });
      console.log(`🧹 Deduplicated ${duplicateIdsToDelete.length} duplicate entries in database.`);
    }
  } catch (err) {
    console.error('Failed to deduplicate database leads:', err);
  }
}

export async function performSheetSync() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  
  if (!settings?.selectedSpreadsheetId || !settings?.selectedSheetName || !settings?.googleAccessToken) {
    return { synced: 0, duplicates: 0, skippedLowQuality: 0, total: 0, error: 'Settings not configured' };
  }

  const mapping: ColumnMapping = settings.columnMapping 
    ? JSON.parse(settings.columnMapping)
    : DEFAULT_MAPPING;
  
  const rows = await getSheetData(settings.selectedSpreadsheetId, settings.selectedSheetName);
  
  if (!rows || rows.length <= 1) {
    await deduplicateDatabaseLeads();
    return { synced: 0, duplicates: 0, skippedLowQuality: 0, total: 0 };
  }
  
  const dataRows = rows.slice(1);
  let synced = 0;
  let duplicates = 0;
  let skippedLowQuality = 0;
  const activeFingerprints: string[] = [];
  const fingerprintCounts = new Map<string, number>();
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2;
    
    const rawName = (row[mapping.name] || '').toString();
    const rawPhone = (row[mapping.phone] || '').toString();
    const rawEmail = mapping.email !== undefined ? (row[mapping.email] || '').toString() : '';
    const rawCity = (row[mapping.city] || '').toString();

    // Sanitize fields
    const name = sanitizeField(rawName);
    const phone = parsePhoneNumber(rawPhone);
    const email = sanitizeField(rawEmail);
    const city = sanitizeField(rawCity);
    
    if (isLowQualityLead(name, phone, email, city)) {
      skippedLowQuality++;
      continue;
    }
    
    const zipCode = parseZipCode((row[mapping.zipCode] || '').toString());
    const platform = sanitizeField((row[mapping.platform] || '').toString());
    const createdAtRaw = (row[mapping.createdAt] || '').toString().trim();
    const remark = sanitizeField((row[mapping.remark] || '').toString()) || null;
    const statusRaw = (row[mapping.status] || '').toString().trim().toLowerCase();
    
    let createdAt = new Date();
    if (createdAtRaw) {
      const parsed = new Date(createdAtRaw);
      if (!isNaN(parsed.getTime())) {
        createdAt = parsed;
      }
    }
    
    let status = 'created';
    if (statusRaw.includes('successful') || statusRaw === 'closed_successful') {
      status = 'closed_successful';
    } else if (statusRaw.includes('unsuccessful') || statusRaw === 'closed_unsuccessful') {
      status = 'closed_unsuccessful';
    } else if (statusRaw === 'closed') {
      status = 'closed_successful';
    }
    
    const baseFingerprint = `${phone}|${platform}|${createdAtRaw}`;
    const count = fingerprintCounts.get(baseFingerprint) || 0;
    fingerprintCounts.set(baseFingerprint, count + 1);
    
    const fingerprint = `${baseFingerprint}|${count}`;
    activeFingerprints.push(fingerprint);
    
    try {
      let existing = await prisma.lead.findFirst({
        where: { fingerprint }
      });

      // Migration fallback for leads synced before fingerprints were added or occurrence added
      if (!existing && count === 0) {
        existing = await prisma.lead.findFirst({
          where: {
            phone,
            platform,
            OR: [
              { fingerprint: null },
              { fingerprint: baseFingerprint }
            ]
          }
        });
      }

      if (existing) {
        await prisma.lead.update({
          where: { id: existing.id },
          data: {
            name,
            phone,
            email,
            city,
            zipCode,
            platform,
            remark: remark || existing.remark,
            status: existing.status !== 'created' ? existing.status : status,
            sheetRow: rowNumber,
            sheetId: settings.selectedSpreadsheetId,
            fingerprint,
          },
        });
        duplicates++;
      } else {
        await prisma.lead.create({
          data: {
            name,
            phone,
            email,
            city,
            zipCode,
            platform,
            createdAt,
            remark,
            status,
            sheetRow: rowNumber,
            sheetId: settings.selectedSpreadsheetId,
            fingerprint,
          },
        });
        synced++;
      }
    } catch (err) {
      console.error(`Failed to sync row ${rowNumber}:`, err);
    }
  }
  
  // Single Source of Truth: Cleanup any lead not present in the current Google Sheet
  if (activeFingerprints.length > 0) {
    await prisma.lead.deleteMany({
      where: {
        OR: [
          { fingerprint: { notIn: activeFingerprints } },
          { fingerprint: null }
        ]
      }
    });
  }

  // Assign nearest branch to any leads without one
  const unassignedLeads = await prisma.lead.findMany({
    where: { assignedBranch: null }
  });
  
  if (unassignedLeads.length > 0) {
    const { assignNearestBranchToLead } = await import('./assignment');
    for (const l of unassignedLeads) {
      await assignNearestBranchToLead(l.id);
    }
  }

  await prisma.settings.update({
    where: { id: 1 },
    data: { lastSyncAt: new Date() },
  });
  
  return {
    synced,
    duplicates,
    skippedLowQuality,
    total: dataRows.length,
  };
}

export async function clearAndResyncDatabase() {
  await prisma.lead.deleteMany();
  console.log('🧹 Purged corrupt database data.');
  return await performSheetSync();
}
