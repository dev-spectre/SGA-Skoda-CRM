import { NextResponse } from 'next/server';
import { checkAndNotify } from '@/lib/notifications';

export async function GET() {
  try {
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
