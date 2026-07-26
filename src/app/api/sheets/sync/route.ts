import { NextResponse } from 'next/server';
import { performSheetSync } from '@/lib/sync';

export async function POST() {
  try {
    const result = await performSheetSync();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
