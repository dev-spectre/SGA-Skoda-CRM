import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { processGradualNotifications } from '@/lib/notifications';

export async function GET() {
  // Use Vercel's waitUntil to execute gradual notifications in background on Vercel serverless
  waitUntil(
    processGradualNotifications().catch((err) => {
      console.error('Background gradual notification dispatch error:', err);
    })
  );

  // Return instant 200 OK response to cron job
  return NextResponse.json(
    { status: 'ok', message: 'Notification dispatch triggered' },
    { status: 200 }
  );
}

export async function POST() {
  return GET();
}
