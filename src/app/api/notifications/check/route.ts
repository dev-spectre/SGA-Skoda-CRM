import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkAndNotify, processGradualNotifications } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  try {
    const isAsync = request.nextUrl.searchParams.get('async') === 'true';
    if (isAsync) {
      waitUntil(processGradualNotifications().catch(console.error));
      return NextResponse.json({ status: 'ok', message: 'Gradual notification dispatch triggered' }, { status: 200 });
    }

    const result = await checkAndNotify();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Notification check error:', error);
    return NextResponse.json(
      { error: 'Failed to check notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
