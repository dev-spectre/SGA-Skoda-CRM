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

    const aggregate = await prisma.lead.aggregate({
      _count: true,
      _max: {
        updatedAt: true,
      },
    });

    const count = aggregate._count || 0;
    const lastUpdated = aggregate._max.updatedAt || null;

    return NextResponse.json({
      count,
      lastUpdated,
    });
  } catch (error: any) {
    console.error('Leads check warning (transient network/DB error):', error?.message || error);
    return NextResponse.json({
      count: 0,
      lastUpdated: null,
      warning: 'Database temporarily unavailable',
    });
  }
}
