import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getSheetData } from '@/lib/google';
import { parsePhoneNumber, sanitizeField } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!currentUser || (!currentUser.allowExternalUpload && !isAdmin)) {
      return NextResponse.json({ error: 'Unauthorized. You do not have permission to upload external data.' }, { status: 403 });
    }

    const body = await request.json();
    const { spreadsheetId, sheetName, rows: directRows, mapping: userMapping, defaultPlatform } = body;

    let rows: (string | number)[][] = [];

    if (Array.isArray(directRows) && directRows.length > 0) {
      // Direct rows uploaded via Excel/CSV
      rows = directRows;
    } else if (spreadsheetId && sheetName) {
      // Google Sheet mode
      let cleanId = String(spreadsheetId).trim();
      const urlMatch = cleanId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (urlMatch) {
        cleanId = urlMatch[1];
      }

      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      if (!settings?.googleAccessToken) {
        return NextResponse.json({ error: 'Google account not linked. Please connect Google in Settings or upload an Excel/CSV file instead.' }, { status: 400 });
      }

      rows = await getSheetData(cleanId, sheetName);
    } else {
      return NextResponse.json({ error: 'Please provide either a Google Sheet or upload an Excel/CSV file.' }, { status: 400 });
    }

    if (!rows || rows.length <= 1) {
      return NextResponse.json({ synced: 0, skipped: 0, total: 0, message: 'Sheet is empty or only contains headers' });
    }

    // Default column mapping if none provided
    const DEFAULT_MAPPING = {
      name: 0,
      phone: 1,
      city: 2,
      createdAt: 3,
      remark: 4,
      status: 5,
      adname: 6,
      branch: 7,
      assignedConsultant: -1,
      testDrive: -1,
      platform: -1,
    };

    const mapping = {
      ...DEFAULT_MAPPING,
      ...(userMapping || {}),
    };

    const dataRows = rows.slice(1);
    let synced = 0;
    let skipped = 0;

    const existingLeads = await prisma.lead.findMany({
      select: { id: true, fingerprint: true, phone: true },
    });

    const existingByFingerprint = new Map<string, number>();
    const existingByPhone = new Map<string, number>();

    for (const lead of existingLeads) {
      if (lead.fingerprint) existingByFingerprint.set(lead.fingerprint, lead.id);
      const cleanPhone = parsePhoneNumber(lead.phone);
      if (cleanPhone) existingByPhone.set(cleanPhone, lead.id);
    }

    const toCreate: any[] = [];
    const seenPhonesInSheet = new Set<string>();

    const getVal = (row: (string | number)[], colIndex: number | undefined): string => {
      if (colIndex === undefined || colIndex === null || colIndex < 0 || colIndex >= row.length) {
        return '';
      }
      return String(row[colIndex] ?? '').trim();
    };

    let uploaderDbId: number | null = currentUser.userId > 0 ? currentUser.userId : null;
    if (!uploaderDbId) {
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: currentUser.username, mode: 'insensitive' } },
            { role: 'ADMIN' }
          ]
        },
        select: { id: true }
      });
      if (dbUser) {
        uploaderDbId = dbUser.id;
      }
    }

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      const rawName = getVal(row, mapping.name);
      const rawPhone = getVal(row, mapping.phone);

      const name = sanitizeField(rawName);
      const phone = parsePhoneNumber(rawPhone);

      if (!phone) {
        skipped++;
        continue;
      }

      if (seenPhonesInSheet.has(phone)) {
        skipped++;
        continue;
      }
      seenPhonesInSheet.add(phone);

      const cleanCity = sanitizeField(getVal(row, mapping.city));
      const fingerprint = `${name.toLowerCase()}|${phone}|${cleanCity.toLowerCase()}`;

      if (existingByFingerprint.has(fingerprint) || existingByPhone.has(phone)) {
        skipped++;
        continue;
      }

      // Platform assignment
      const rawPlatform = getVal(row, mapping.platform);
      let mappedPlatform = sanitizeField(rawPlatform);
      if (mappedPlatform) {
        mappedPlatform = mappedPlatform.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
        const isDateStr = /^\d{4}-\d{2}-\d{2}$/.test(mappedPlatform) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(mappedPlatform) || (!isNaN(Date.parse(mappedPlatform)) && (mappedPlatform.includes('-') || mappedPlatform.includes('/')));
        if (isDateStr) {
          mappedPlatform = '';
        }
      }
      const cleanDefaultPlatform = defaultPlatform ? sanitizeField(defaultPlatform) : '';
      const assignedPlatform = mappedPlatform || cleanDefaultPlatform || currentUser.assignedPlatform || 'Unknown';
      const uploadedById = uploaderDbId;

      // Status mapping
      const rawStatus = getVal(row, mapping.status).toLowerCase();
      let status = 'not_contacted';
      if (['live', 'completed', 'won', 'closed_successful', 'booked'].some(s => rawStatus.includes(s))) status = 'live';
      else if (['lost', 'dead', 'closed_unsuccessful', 'cancelled', 'drop'].some(s => rawStatus.includes(s))) status = 'lost';
      else if (['pending', 'follow up', 'followup', 'contacted', 'warm', 'hot'].some(s => rawStatus.includes(s))) status = 'pending';

      // Test drive mapping
      const rawTd = getVal(row, mapping.testDrive).toLowerCase();
      let testDrive: string | null = null;
      if (rawTd === 'scheduled') testDrive = 'Scheduled';
      else if (rawTd === 'completed' || rawTd === 'taken' || rawTd === 'done') testDrive = 'Completed';
      else if (rawTd === 'cancelled' || rawTd === 'canceled') testDrive = 'Cancelled';
      else if (rawTd === 'yes' || rawTd === 'y' || rawTd === 'true') testDrive = 'Scheduled';
      else if (rawTd === 'no' || rawTd === 'n' || rawTd === 'false' || rawTd === 'not scheduled') testDrive = 'Not Scheduled';
      else if (rawTd) testDrive = getVal(row, mapping.testDrive);

      // Created At parsing
      const createdAtRaw = getVal(row, mapping.createdAt);
      let createdAt = new Date();
      if (createdAtRaw) {
        const parsed = new Date(createdAtRaw);
        if (!isNaN(parsed.getTime())) createdAt = parsed;
      }

      const assignedConsultant = sanitizeField(getVal(row, mapping.assignedConsultant)) || null;
      const branch = sanitizeField(getVal(row, mapping.branch)) || currentUser.assignedBranch || '';

      toCreate.push({
        name: name || 'Unknown',
        phone,
        city: cleanCity,
        adname: sanitizeField(getVal(row, mapping.adname)),
        branch,
        remark: sanitizeField(getVal(row, mapping.remark)) || null,
        assignedConsultant,
        testDrive,
        status,
        platform: assignedPlatform,
        fingerprint,
        source: 'External Upload',
        uploadedById,
        uploadedAt: new Date(),
        createdAt,
        updatedAt: new Date(),
      });

      synced++;
    }

    if (toCreate.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        await prisma.lead.createMany({
          data: chunk,
        });
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: dataRows.length,
      message: `Successfully imported ${synced} leads! (Skipped ${skipped} duplicates/invalid rows)`,
    });
  } catch (error: any) {
    console.error('External Sync Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to upload and import leads' }, { status: 500 });
  }
}
