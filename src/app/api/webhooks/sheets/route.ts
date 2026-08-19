import { NextRequest, NextResponse } from 'next/server';
import { performSheetSync } from '@/lib/sync';
import { checkAndNotify } from '@/lib/notifications';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  try {
    let payload: any = null;
    try {
      const text = await request.text();
      if (text && text.trim()) {
        payload = JSON.parse(text);
      }
    } catch {
      // payload might not be JSON, ignore and proceed with sheet sync
    }

    console.log('⚡ Instant Sheet Webhook Triggered from Google Apps Script:', payload?.event || 'instant_sync');

    // 1. Perform instant sync from linked Google Sheet
    const syncResult = await performSheetSync();

    // 2. Dispatch push notification check if new leads arrived
    if (syncResult.synced > 0) {
      checkAndNotify().catch((err) => console.error('Webhook notification dispatch error:', err));
    }

    return NextResponse.json(
      {
        success: true,
        message: syncResult.synced > 0 
          ? `Instant sync completed: ${syncResult.synced} new lead(s) imported!`
          : 'Instant sync completed: No new leads detected in sheet.',
        synced: syncResult.synced,
        duplicates: syncResult.duplicates,
        totalRows: syncResult.total,
        timestamp: new Date().toISOString(),
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('Webhook sheet sync error:', error);
    return NextResponse.json(
      { error: 'Failed to process sheet webhook', details: error?.message || String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: 'active',
      endpoint: '/api/webhooks/sheets',
      method: 'POST',
      message: 'Sheet Webhook endpoint is active and ready for Google Apps Script.',
      usage: 'Configure an onEdit, onChange, or onFormSubmit trigger in Google Sheets Apps Script to POST to this endpoint for real-time lead ingestion.',
    },
    { headers: CORS_HEADERS }
  );
}
