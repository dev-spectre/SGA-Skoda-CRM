import { google } from 'googleapis';
import { prisma } from './prisma';
import { parsePhoneNumber } from './utils';
import { getCachedSettings, invalidateSettingsCache } from './settings';

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

  const existingSettings = await getCachedSettings();

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
  invalidateSettingsCache();

  return tokens;
}

export class GoogleSessionExpiredError extends Error {
  isSessionExpired: boolean;
  constructor(message: string = 'Google session expired (invalid grant). Please reconnect your Google account in Settings.') {
    super(message);
    this.name = 'GoogleSessionExpiredError';
    this.isSessionExpired = true;
  }
}

let activeOAuthClient: InstanceType<typeof google.auth.OAuth2> | null = null;

export async function refreshGoogleTokens(): Promise<string> {
  const settings = await getCachedSettings();

  if (!settings?.googleRefreshToken) {
    throw new GoogleSessionExpiredError('No Google refresh token found. Please connect your Google account in Settings.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: settings.googleAccessToken || undefined,
    refresh_token: settings.googleRefreshToken,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    let expiryDate: Date | null = null;
    if (credentials.expiry_date && !isNaN(Number(credentials.expiry_date))) {
      expiryDate = new Date(Number(credentials.expiry_date));
    } else {
      expiryDate = new Date(Date.now() + 3500 * 1000);
    }

    const updatedAccessToken = credentials.access_token || settings.googleAccessToken;
    const updatedRefreshToken = credentials.refresh_token || settings.googleRefreshToken;

    await prisma.settings.update({
      where: { id: 1 },
      data: {
        googleAccessToken: updatedAccessToken,
        googleRefreshToken: updatedRefreshToken,
        googleTokenExpiry: expiryDate,
      },
    });
    invalidateSettingsCache();

    if (activeOAuthClient) {
      activeOAuthClient.setCredentials({
        access_token: updatedAccessToken || undefined,
        refresh_token: updatedRefreshToken || undefined,
        expiry_date: expiryDate ? expiryDate.getTime() : undefined,
      });
    }

    console.log('🔄 Successfully refreshed Google access token.');
    return updatedAccessToken!;
  } catch (err: any) {
    const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    const isInvalidGrant = errMsg.includes('invalid_grant') || 
      err?.response?.data?.error === 'invalid_grant' || 
      errMsg.includes('expired or revoked');

    if (isInvalidGrant) {
      console.error('❌ Google session permanently expired (invalid_grant). Clearing credentials in DB.');
      await prisma.settings.update({
        where: { id: 1 },
        data: {
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null,
        },
      });
      invalidateSettingsCache();
      activeOAuthClient = null;
      throw new GoogleSessionExpiredError('Google session expired (invalid grant). Please reconnect your Google account in Settings.');
    }

    throw err;
  }
}

export async function getAuthenticatedClient() {
  const settings = await getCachedSettings();

  if (!settings?.googleAccessToken && !settings?.googleRefreshToken) {
    throw new GoogleSessionExpiredError('Google account not linked. Please connect in Settings.');
  }

  // Check if token needs refresh with a 5-minute safety buffer
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  const isExpiredOrClose = !settings.googleAccessToken || 
    (settings.googleTokenExpiry && settings.googleTokenExpiry.getTime() <= fiveMinutesFromNow);

  if (isExpiredOrClose && settings.googleRefreshToken) {
    try {
      await refreshGoogleTokens();
    } catch (err) {
      if (err instanceof GoogleSessionExpiredError) {
        throw err;
      }
      console.warn('Initial token refresh attempt had non-fatal warning:', err);
    }
  }

  const latestSettings = await getCachedSettings();
  if (!latestSettings?.googleAccessToken) {
    throw new GoogleSessionExpiredError('Google session expired. Please reconnect your Google account in Settings.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: latestSettings.googleAccessToken,
    refresh_token: latestSettings.googleRefreshToken || undefined,
    expiry_date: latestSettings.googleTokenExpiry ? latestSettings.googleTokenExpiry.getTime() : undefined,
  });

  // Attach listener to capture any tokens refreshed internally by googleapis
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      let expiryDate: Date | null = null;
      if (newTokens.expiry_date && !isNaN(Number(newTokens.expiry_date))) {
        expiryDate = new Date(Number(newTokens.expiry_date));
      }
      await prisma.settings.update({
        where: { id: 1 },
        data: {
          googleAccessToken: newTokens.access_token || undefined,
          googleRefreshToken: newTokens.refresh_token || undefined,
          googleTokenExpiry: expiryDate || undefined,
        },
      });
      invalidateSettingsCache();
    } catch (saveErr) {
      console.error('Failed to auto-save refreshed Google tokens:', saveErr);
    }
  });

  activeOAuthClient = oauth2Client;
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

// --- Quota Protection, Rate Limiting & Exponential Backoff ---
let lastGoogleRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 250; // Max 4 requests/sec (safely under Google's 60 req/min quota)

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1500
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const status = err?.status || err?.response?.status || err?.code;
    const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));

    const isAuthError = status === 401 ||
      errMsg.includes('invalid_grant') ||
      errMsg.includes('invalid_token') ||
      errMsg.includes('Token has been expired or revoked') ||
      err?.response?.data?.error === 'invalid_grant';

    if (isAuthError) {
      console.warn('⚠️ Google Auth error detected during API call. Attempting refresh and retry...');
      try {
        await refreshGoogleTokens();
        // Retry the operation once with fresh token
        return await fn();
      } catch (refreshErr: any) {
        if (refreshErr instanceof GoogleSessionExpiredError) {
          throw refreshErr;
        }
        const refreshMsg = String(refreshErr?.message || refreshErr);
        if (refreshMsg.includes('invalid_grant')) {
          throw new GoogleSessionExpiredError('Google session expired (invalid grant). Please reconnect your Google account in Settings.');
        }
        throw refreshErr;
      }
    }

    const isRateLimit = status === 429 || errMsg.includes('Quota exceeded') || errMsg.includes('RATE_LIMIT_EXCEEDED') || errMsg.includes('User Rate Limit Exceeded');
    const isServerTransient = status === 500 || status === 503 || status === 502;

    if ((isRateLimit || isServerTransient) && retries > 0) {
      const jitter = Math.floor(Math.random() * 500);
      const waitTime = delayMs + jitter;
      console.warn(`[Google Sheets API] Transient error (${status}). Retrying in ${waitTime}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return executeWithRetry(fn, retries - 1, delayMs * 2);
    }
    throw err;
  }
}

export async function throttleRequest<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const timeSinceLast = now - lastGoogleRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLast));
  }
  lastGoogleRequestTime = Date.now();
  return executeWithRetry(fn);
}

export async function listSpreadsheets() {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });
  
  const response = await throttleRequest(() =>
    drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    })
  );
  
  return response.data.files || [];
}

export async function getSheetNames(spreadsheetId: string) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await throttleRequest(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    })
  );
  
  return response.data.sheets?.map((s: { properties?: { title?: string | null } | null }) => s.properties?.title || '') || [];
}

export async function getSheetData(spreadsheetId: string, sheetName: string) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await throttleRequest(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}`,
    })
  );
  
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
  
  await throttleRequest(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]],
      },
    })
  );
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
  
  await throttleRequest(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    })
  );
}

/**
 * Bulk updates multiple rows and cells across the Google Sheet in a single API call.
 * Slashes API quota consumption by combining 100+ separate requests into 1 batch.
 */
export async function batchUpdateSheetRows(
  spreadsheetId: string,
  sheetName: string,
  rowUpdates: { row: number; colValues: { col: number; value: string }[] }[]
) {
  if (!rowUpdates || rowUpdates.length === 0) return;
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const allValueRanges = rowUpdates.flatMap(({ row, colValues }) =>
    colValues.map(({ col, value }) => {
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
    })
  );

  // Chunk in batches of 500 ranges per single HTTP request to adhere to payload limits
  const chunkSize = 500;
  for (let i = 0; i < allValueRanges.length; i += chunkSize) {
    const chunk = allValueRanges.slice(i, i + chunkSize);
    await throttleRequest(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: chunk,
        },
      })
    );
  }
}

export async function appendSheetRow(
  spreadsheetId: string,
  sheetName: string,
  rowValues: (string | number)[]
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await throttleRequest(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues],
      },
    })
  );
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
  await throttleRequest(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    })
  );
}

export async function deleteSheetRow(
  spreadsheetId: string,
  sheetName: string,
  row: number
) {
  const auth = await getAuthenticatedClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheet = await throttleRequest(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    })
  );

  const targetSheet = spreadsheet.data.sheets?.find(
    (s: { properties?: { title?: string | null } | null }) => s.properties?.title === sheetName
  );

  const numericSheetId = targetSheet?.properties?.sheetId ?? 0;

  await throttleRequest(() =>
    sheets.spreadsheets.batchUpdate({
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
    })
  );
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

    const spreadsheet = await throttleRequest(() =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title)',
      })
    );

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

      await throttleRequest(() =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests },
        })
      );
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

  const settings = await getCachedSettings();
  if (!settings?.googleAccessToken) return null;

  const rows = await getSheetData(spreadsheetId, sheetName);
  if (!rows || rows.length <= 1) return null;

  const mapping = settings.columnMapping 
    ? JSON.parse(settings.columnMapping) 
    : {};

  // STRICT RULE: ONLY permitted to write back CRM-managed fields:
  // remark, followUpDate1, followUpDate2, status, testDrive, assignedConsultant.
  // CRITICAL ARCHITECTURAL GUARD: Read-only source columns (branch, name, phone, city,
  // adname, platform, createdAt) must NEVER under any circumstances be written to!
  const sourceCols = new Set<number>();
  const sourceKeys = ['branch', 'name', 'phone', 'city', 'adname', 'platform', 'createdAt'] as const;
  for (const k of sourceKeys) {
    if (mapping[k] !== undefined && mapping[k] >= 0) {
      sourceCols.add(mapping[k]);
    }
  }

  const allowedCols = new Set<number>();
  if (mapping.remark !== undefined && mapping.remark >= 0) allowedCols.add(mapping.remark);
  if (mapping.status !== undefined && mapping.status >= 0) allowedCols.add(mapping.status);
  if (mapping.followUpDate1 !== undefined && mapping.followUpDate1 >= 0) allowedCols.add(mapping.followUpDate1);
  if (mapping.followUpDate2 !== undefined && mapping.followUpDate2 >= 0) allowedCols.add(mapping.followUpDate2);
  if (mapping.testDrive !== undefined && mapping.testDrive >= 0) allowedCols.add(mapping.testDrive);
  if (mapping.assignedConsultant !== undefined && mapping.assignedConsultant >= 0) allowedCols.add(mapping.assignedConsultant);

  // Strip any column that collides with a read-only source column
  for (const sc of sourceCols) {
    allowedCols.delete(sc);
  }

  const safeUpdates = updates.filter(u => allowedCols.has(u.col));
  if (safeUpdates.length === 0) return null;

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
    const formattedUpdates = safeUpdates.map(u => {
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
  }

  return null;
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
  const settings = await getCachedSettings();
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
