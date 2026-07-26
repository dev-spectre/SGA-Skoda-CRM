import { NextResponse } from 'next/server';
import { listSpreadsheets, getSheetNames } from '@/lib/google';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId = searchParams.get('spreadsheetId');
    
    // If spreadsheetId is provided, return sheet names for that spreadsheet
    if (spreadsheetId) {
      const sheetNames = await getSheetNames(spreadsheetId);
      return NextResponse.json({ sheets: sheetNames });
    }
    
    // Otherwise, return list of spreadsheets
    const spreadsheets = await listSpreadsheets();
    return NextResponse.json({ spreadsheets });
  } catch (error) {
    console.error('List sheets error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list sheets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
