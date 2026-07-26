import { NextResponse } from 'next/server';
import { performSheetSync } from '@/lib/sync';
import { checkAndNotify } from '@/lib/notifications';

export async function POST() {
  try {
    const syncResult = await performSheetSync();
    await checkAndNotify();
    return NextResponse.json({
      success: true,
      message: 'Sheet synced and checked via webhook',
      syncResult,
    });
  } catch (error) {
    console.error('Webhook sheet sync error:', error);
    return NextResponse.json(
      { error: 'Failed to process sheet webhook' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Sheet Webhook endpoint active. Send POST request to trigger sync.' });
}
