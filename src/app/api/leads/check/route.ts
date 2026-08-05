import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { performSheetSync } from '@/lib/sync';

let lastSyncTime = 0;
let isSyncing = false;
const SYNC_INTERVAL_MS = 60000; // Throttle auto-sync to once every 60 seconds server-wide

export async function GET() {
  try {
    const now = Date.now();
    // Trigger background sheet sync if cooldown has passed and no sync is running
    if (now - lastSyncTime > SYNC_INTERVAL_MS && !isSyncing) {
      isSyncing = true;
      performSheetSync()
        .then(() => {
          lastSyncTime = Date.now();
        })
        .catch((err) => {
          console.error('Auto background sheet sync error:', err);
        })
        .finally(() => {
          isSyncing = false;
        });
    }

    // Single ultra-fast raw query returning count & max updatedAt (< 50 bytes data transfer)
    const result = await prisma.$queryRaw<{ count: number; lastUpdated: Date | null }[]>`
      SELECT COUNT(*)::int as count, MAX("updatedAt") as "lastUpdated" FROM "Lead"
    `;

    const count = result[0]?.count || 0;
    const lastUpdated = result[0]?.lastUpdated || null;

    return NextResponse.json({
      count,
      lastUpdated,
    });
  } catch (error) {
    console.error('Leads check error:', error);
    return NextResponse.json({ error: 'Failed to check leads' }, { status: 500 });
  }
}
