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
    const rows = await getSheetData(spreadsheetId, sheetName);
    if (!rows || rows.length <= 1) return;

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
  lead: { id: number; name: string; phone: string; email?: string; sheetRow?: number | null },
  updates: { col: number; value: string }[]
): Promise<number | null> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.googleAccessToken) return null;

  const rows = await getSheetData(spreadsheetId, sheetName);
  if (!rows || rows.length <= 1) return null;

  const mapping = settings.columnMapping 
    ? JSON.parse(settings.columnMapping) 
    : { name: 0, phone: 1 };

  const cleanLeadPhone = parsePhoneNumber(lead.phone);
  const cleanLeadName = (lead.name || '').trim().toLowerCase();
  const cleanLeadEmail = (lead.email || '').trim().toLowerCase();

  let targetRowIndex: number | null = null;

  // 1. Search by exact phone match if available
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

  // 2. If not found by phone, search by name + email/city
  if (!targetRowIndex && cleanLeadName) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rName = (r[mapping.name] || '').toString().trim().toLowerCase();
      const rEmail = mapping.email !== undefined ? (r[mapping.email] || '').toString().trim().toLowerCase() : '';
      if (rName === cleanLeadName && (!cleanLeadEmail || rEmail === cleanLeadEmail)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  // 3. Fallback to cached sheetRow if row at sheetRow still matches lead
  if (!targetRowIndex && lead.sheetRow && lead.sheetRow <= rows.length) {
    const r = rows[lead.sheetRow - 1];
    if (r) {
      const rName = (r[mapping.name] || '').toString().trim().toLowerCase();
      const rPhone = parsePhoneNumber((r[mapping.phone] || '').toString().trim());
      if ((cleanLeadPhone && rPhone === cleanLeadPhone) || (cleanLeadName && rName === cleanLeadName)) {
        targetRowIndex = lead.sheetRow;
      }
    }
  }

  if (targetRowIndex) {
    await updateSheetRow(spreadsheetId, sheetName, targetRowIndex, updates);
    await prisma.lead.update({
      where: { id: lead.id },
      data: { sheetRow: targetRowIndex },
    });
    return targetRowIndex;
  } else {
    console.warn(`Could not locate matching Google Sheet row for lead ID ${lead.id} ("${lead.name}", "${lead.phone}")`);
    return null;
  }
}

export async function findAndDeleteSheetRow(
  spreadsheetId: string,
  sheetName: string,
  lead: { id: number; name: string; phone: string; email?: string; sheetRow?: number | null }
): Promise<boolean> {
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
