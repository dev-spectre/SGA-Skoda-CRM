import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSheetData } from '@/lib/google';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!currentUser || (!currentUser.allowExternalUpload && !isAdmin)) {
      return NextResponse.json({ error: 'Unauthorized. You do not have permission to preview sheets.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let spreadsheetId = searchParams.get('spreadsheetId') || '';
    const sheetName = searchParams.get('sheetName') || '';

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'spreadsheetId is required' }, { status: 400 });
    }

    // Extract ID if a full Google Sheets URL was passed
    const urlMatch = spreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      spreadsheetId = urlMatch[1];
    }

    const rows = await getSheetData(spreadsheetId, sheetName);

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        headers: [],
        previewRows: [],
        totalRows: 0,
        message: 'Sheet is empty',
      });
    }

    const headers = (rows[0] || []).map((h: unknown) => String(h || '').trim());
    const previewRows = rows.slice(1, 6).map((row: unknown[]) =>
      headers.map((_, colIdx) => String(row[colIdx] ?? ''))
    );

    return NextResponse.json({
      spreadsheetId,
      sheetName,
      headers,
      previewRows,
      totalRows: rows.length - 1,
    });
  } catch (error: any) {
    console.error('Sheet preview error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch sheet preview' }, { status: 500 });
  }
}
