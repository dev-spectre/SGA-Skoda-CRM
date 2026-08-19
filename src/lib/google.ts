import { google } from 'googleapis';
import { prisma } from './prisma';
import { parsePhoneNumber } from './utils';

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
}

export async function handleCallback(code: string) {
  if (!code) {
    throw new Error('Authorization code is missing');
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const existingSettings = await prisma.settings.findUnique({ where: { id: 1 } });

  let email: string | null = null;
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const about = await drive.about.get({ fields: 'user' });
    email = about.data.user?.emailAddress || null;
  } catch (err) {
    console.error('Failed to fetch drive user info during OAuth callback:', err);
  }

  if (!email) {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data?.email || null;
    } catch (err) {
      console.error('Failed to fetch userinfo during OAuth callback:', err);
    }
  }

  let tokenExpiryDate: Date | null = null;
  if (tokens.expiry_date && !isNaN(Number(tokens.expiry_date))) {
    tokenExpiryDate = new Date(Number(tokens.expiry_date));
  } else if (existingSettings?.googleTokenExpiry) {
    tokenExpiryDate = existingSettings.googleTokenExpiry;
  }

  const accessToken = tokens.access_token || existingSettings?.googleAccessToken || null;
  const refreshToken = tokens.refresh_token || existingSettings?.googleRefreshToken || null;
  const finalEmail = email || existingSettings?.googleAccountEmail || null;

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      googleTokenExpiry: tokenExpiryDate,
      googleAccountEmail: finalEmail,
    },
    create: {
      id: 1,
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      googleTokenExpiry: tokenExpiryDate,
      googleAccountEmail: finalEmail,
    },
  });

  return tokens;
}

export async function getAuthenticatedClient() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  if (!settings?.googleAccessToken) {
    throw new Error('Google account not linked. Please connect in Settings.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: settings.googleAccessToken,
    refresh_token: settings.googleRefreshToken || undefined,
    expiry_date: settings.googleTokenExpiry ? settings.googleTokenExpiry.getTime() : undefined,
  });

  // Check if token needs refresh
  if (settings.googleTokenExpiry && new Date() >= settings.googleTokenExpiry) {
    if (!settings.googleRefreshToken) {
      console.warn('Access token expired but no refresh token available');
      return oauth2Client;
    }
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      let expiryDate: Date | null = settings.googleTokenExpiry;
      if (credentials.expiry_date && !isNaN(Number(credentials.expiry_date))) {
        expiryDate = new Date(Number(credentials.expiry_date));
      }

      await prisma.settings.update({
        where: { id: 1 },
        data: {
          googleAccessToken: credentials.access_token || settings.googleAccessToken,
          googleRefreshToken: credentials.refresh_token || settings.googleRefreshToken,
          googleTokenExpiry: expiryDate,
        },
      });
      oauth2Client.setCredentials(credentials);
    } catch (refreshErr) {
      console.error('Failed to refresh Google access token:', refreshErr);
    }
  }

  return oauth2Client;
}

export async function getGoogleAccountEmail(): Promise<string | null> {
  try {
    const auth = await getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'user' });
    const email = about.data.user?.emailAddress || null;
    
    if (email) {
      await prisma.settings.update({
        where: { id: 1 },
        data: { googleAccountEmail: email },
      });
      return email;
    }
  } catch (err) {
    console.error('Failed to fetch Google Account email via Drive API:', err);
  }

  try {
    const auth = await getAuthenticatedClient();
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const userInfo = await oauth2.userinfo.get();
    if (userInfo.data?.email) {
      await prisma.settings.update({
        where: { id: 1 },
        data: { googleAccountEmail: userInfo.data.email },
      });
      return userInfo.data.email;
    }
  } catch {
    // Ignore fallback failure
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return settings?.googleAccountEmail || null;
}

export async function listSpreadsheets() {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });
  
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  });
  
  return response.data.files || [];
}

export async function getSheetNames(spreadsheetId: string) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  
  return response.data.sheets?.map((s: { properties?: { title?: string | null } | null }) => s.properties?.title || '') || [];
}

export async function getSheetData(spreadsheetId: string, sheetName: string) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}`,
  });
  
  return response.data.values || [];
}

export async function updateSheetCell(
  spreadsheetId: string,
  sheetName: string,
  row: number,
  col: number,
  value: string
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Convert column number to letter (0=A, 1=B, etc.)
  let colLetter = '';
  let tempCol = col;
  while (tempCol >= 0) {
    colLetter = String.fromCharCode(65 + (tempCol % 26)) + colLetter;
    tempCol = Math.floor(tempCol / 26) - 1;
  }
  const range = `${sheetName}!${colLetter}${row}`;
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[value]],
    },
  });
}

export async function updateSheetRow(
  spreadsheetId: string,
  sheetName: string,
  row: number,
  colValues: { col: number; value: string }[]
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const data = colValues.map(({ col, value }) => {
    let colLetter = '';
    let tempCol = col;
    while (tempCol >= 0) {
      colLetter = String.fromCharCode(65 + (tempCol % 26)) + colLetter;
      tempCol = Math.floor(tempCol / 26) - 1;
    }
    return {
      range: `${sheetName}!${colLetter}${row}`,
      values: [[value]],
    };
  });
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

export async function appendSheetRow(
  spreadsheetId: string,
  sheetName: string,
  rowValues: (string | number)[]
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues],
    },
  });
  return response.data;
}

export async function clearSheetRow(
  spreadsheetId: string,
  sheetName: string,
  row: number
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const range = `${sheetName}!A${row}:ZZ${row}`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });
}

export async function deleteSheetRow(
  spreadsheetId: string,
  sheetName: string,
  row: number
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });

  const targetSheet = spreadsheet.data.sheets?.find(
    (s: { properties?: { title?: string | null } | null }) => s.properties?.title === sheetName
  );

  const numericSheetId = targetSheet?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: numericSheetId,
              dimension: 'ROWS',
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    },
  });
}

export async function cleanEmptySheetRows(
  spreadsheetId: string,
  sheetName: string
) {
  try {
    const auth = await getAuthenticatedClient();
    const sheets = google.sheets({ version: 'v4', auth });

    const rows = await getSheetData(spreadsheetId, sheetName);
    if (!rows || rows.length <= 1) return;

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    });

    const targetSheet = spreadsheet.data.sheets?.find(
      (s: { properties?: { title?: string | null } | null }) => s.properties?.title === sheetName
    );

    const numericSheetId = targetSheet?.properties?.sheetId ?? 0;

    const emptyRowIndices: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const isEmpty = !r || r.every((cell: unknown) => !cell || String(cell).trim() === '');
      if (isEmpty) {
        emptyRowIndices.push(i);
      }
    }

    if (emptyRowIndices.length > 0) {
      emptyRowIndices.sort((a: number, b: number) => b - a);
      const requests = emptyRowIndices.map((idx: number) => ({
        deleteDimension: {
          range: {
            sheetId: numericSheetId,
            dimension: 'ROWS',
            startIndex: idx,
            endIndex: idx + 1,
          },
        },
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
    }
  } catch (err) {
    console.error('Clean empty sheet rows error:', err);
  }
}

export async function findAndWriteToSheetRow(
  spreadsheetId: string,
  sheetName: string,
  lead: { id: number; name: string; phone: string; sheetRow?: number | null; source?: string | null; uploadedById?: number | null },
  updates: { col: number; value: string }[]
): Promise<number | null> {
  // External upload leads are strictly fetch-only and must NEVER write data back to sheets
  if (lead.source === 'External Upload' || (lead.uploadedById !== null && lead.uploadedById !== undefined)) {
    return null;
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.googleAccessToken) return null;

  const rows = await getSheetData(spreadsheetId, sheetName);
  if (!rows || rows.length <= 1) return null;

  const mapping = settings.columnMapping 
    ? JSON.parse(settings.columnMapping) 
    : { name: 0, phone: 1 };

  const cleanLeadPhone = parsePhoneNumber(lead.phone);
  const cleanLeadName = (lead.name || '').trim().toLowerCase();

  let targetRowIndex: number | null = null;

  // 1. Check cached sheetRow first if available and valid
  if (lead.sheetRow && lead.sheetRow <= rows.length && lead.sheetRow >= 2) {
    const r = rows[lead.sheetRow - 1];
    if (r) {
      const rPhone = parsePhoneNumber((r[mapping.phone] || '').toString().trim());
      const rName = (r[mapping.name] || '').toString().trim().toLowerCase();
      if ((cleanLeadPhone && rPhone === cleanLeadPhone) || (cleanLeadName && (rName.includes(cleanLeadName) || cleanLeadName.includes(rName)))) {
        targetRowIndex = lead.sheetRow;
      }
    }
  }

  // 2. Search by exact phone match across all rows
  if (!targetRowIndex && cleanLeadPhone) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rPhone = parsePhoneNumber((r[mapping.phone] || '').toString().trim());
      if (rPhone === cleanLeadPhone) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  // 3. Fallback to name search
  if (!targetRowIndex && cleanLeadName) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rName = (r[mapping.name] || '').toString().trim().toLowerCase();
      if (rName === cleanLeadName) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  if (targetRowIndex) {
    // Format status values to user-friendly labels for the spreadsheet
    const formattedUpdates = updates.map(u => {
      if (mapping.status !== undefined && u.col === mapping.status) {
        const val = u.value.toLowerCase().trim();
        let formatted = u.value;
        if (val === 'not_contacted' || val === 'created') formatted = 'Not Contacted';
        else if (val === 'pending') formatted = 'Contacted';
        else if (val === 'live' || val === 'closed_successful') formatted = 'Completed';
        else if (val === 'lost' || val === 'closed_unsuccessful') formatted = 'Lost';
        return { col: u.col, value: formatted };
      }
      return u;
    });

    await updateSheetRow(spreadsheetId, sheetName, targetRowIndex, formattedUpdates);
    await prisma.lead.update({
      where: { id: lead.id },
      data: { sheetRow: targetRowIndex, sheetId: spreadsheetId },
    });
    return targetRowIndex;
  } else {
    // Lead was deleted or missing from the sheet, but is updated in CRM: write it back by appending to the sheet!
    try {
      const fullLead = await prisma.lead.findUnique({ where: { id: lead.id } });
      if (fullLead) {
        let maxCol = 0;
        for (const colIdx of Object.values(mapping)) {
          if (typeof colIdx === 'number' && colIdx > maxCol) {
            maxCol = colIdx;
          }
        }
        const newRow: string[] = new Array(maxCol + 1).fill('');

        if (mapping.name !== undefined && mapping.name >= 0) newRow[mapping.name] = fullLead.name || '';
        if (mapping.phone !== undefined && mapping.phone >= 0) newRow[mapping.phone] = fullLead.phone || '';
        if (mapping.city !== undefined && mapping.city >= 0) newRow[mapping.city] = fullLead.city || '';
        if (mapping.adname !== undefined && mapping.adname >= 0) newRow[mapping.adname] = fullLead.adname || '';
        if (mapping.branch !== undefined && mapping.branch >= 0) newRow[mapping.branch] = fullLead.branch || '';
        if (mapping.platform !== undefined && mapping.platform >= 0) newRow[mapping.platform] = fullLead.platform || '';
        if (mapping.assignedConsultant !== undefined && mapping.assignedConsultant >= 0) newRow[mapping.assignedConsultant] = fullLead.assignedConsultant || '';
        if (mapping.testDrive !== undefined && mapping.testDrive >= 0) newRow[mapping.testDrive] = fullLead.testDrive || '';
        if (mapping.createdAt !== undefined && mapping.createdAt >= 0) newRow[mapping.createdAt] = fullLead.createdAt ? fullLead.createdAt.toISOString().split('T')[0] : '';
        if (mapping.followUpDate1 !== undefined && mapping.followUpDate1 >= 0) newRow[mapping.followUpDate1] = fullLead.followUpDate1 ? fullLead.followUpDate1.toISOString().split('T')[0] : '';
        if (mapping.followUpDate2 !== undefined && mapping.followUpDate2 >= 0) newRow[mapping.followUpDate2] = fullLead.followUpDate2 ? fullLead.followUpDate2.toISOString().split('T')[0] : '';

        if (mapping.status !== undefined && mapping.status >= 0) {
          const val = (fullLead.status || '').toLowerCase().trim();
          let formatted = 'Not Contacted';
          if (val === 'pending') formatted = 'Contacted';
          else if (val === 'live' || val === 'closed_successful') formatted = 'Completed';
          else if (val === 'lost' || val === 'closed_unsuccessful') formatted = 'Lost';
          newRow[mapping.status] = formatted;
        }
        if (mapping.remark !== undefined && mapping.remark >= 0) newRow[mapping.remark] = fullLead.remark || '';

        // Apply current updates
        for (const u of updates) {
          if (u.col >= 0 && u.col < newRow.length) {
            if (mapping.status !== undefined && u.col === mapping.status) {
              const val = u.value.toLowerCase().trim();
              let formatted = u.value;
              if (val === 'not_contacted' || val === 'created') formatted = 'Not Contacted';
              else if (val === 'pending') formatted = 'Contacted';
              else if (val === 'live' || val === 'closed_successful') formatted = 'Completed';
              else if (val === 'lost' || val === 'closed_unsuccessful') formatted = 'Lost';
              newRow[u.col] = formatted;
            } else {
              newRow[u.col] = u.value;
            }
          }
        }

        await appendSheetRow(spreadsheetId, sheetName, newRow);
        const newRowIdx = rows.length + 1;
        await prisma.lead.update({
          where: { id: lead.id },
          data: { sheetRow: newRowIdx, sheetId: spreadsheetId },
        });
        return newRowIdx;
      }
    } catch (appendErr) {
      console.error(`Failed to append lead ${lead.id} back to Google Sheet:`, appendErr);
    }
    return null;
  }
}

export async function findAndDeleteSheetRow(
  spreadsheetId: string,
  sheetName: string,
  lead: { id: number; name: string; phone: string; sheetRow?: number | null; source?: string | null; uploadedById?: number | null }
): Promise<boolean> {
  // External upload leads are strictly fetch-only and must NEVER write data back to sheets
  if (lead.source === 'External Upload' || (lead.uploadedById !== null && lead.uploadedById !== undefined)) {
    return false;
  }
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.googleAccessToken) return false;

  const rows = await getSheetData(spreadsheetId, sheetName);
  if (!rows || rows.length <= 1) return false;

  const mapping = settings.columnMapping 
    ? JSON.parse(settings.columnMapping) 
    : { name: 0, phone: 1 };

  const cleanLeadPhone = parsePhoneNumber(lead.phone);
  const cleanLeadName = (lead.name || '').trim().toLowerCase();

  let targetRowIndex: number | null = null;

  if (cleanLeadPhone) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rPhone = parsePhoneNumber((r[mapping.phone] || '').toString().trim());
      const rName = (r[mapping.name] || '').toString().trim().toLowerCase();
      if (rPhone === cleanLeadPhone && (!cleanLeadName || rName === cleanLeadName)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  if (!targetRowIndex && cleanLeadName) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rName = (r[mapping.name] || '').toString().trim().toLowerCase();
      if (rName === cleanLeadName) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  if (!targetRowIndex && lead.sheetRow && lead.sheetRow <= rows.length) {
    targetRowIndex = lead.sheetRow;
  }

  if (targetRowIndex) {
    await deleteSheetRow(spreadsheetId, sheetName, targetRowIndex);
    await cleanEmptySheetRows(spreadsheetId, sheetName);
    return true;
  }

  return false;
}
