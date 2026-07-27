import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const platforms = await prisma.lead.findMany({
      select: { platform: true },
      distinct: ['platform'],
      where: { platform: { not: '' } },
      orderBy: { platform: 'asc' }
    });
    return NextResponse.json({ platforms: platforms.map(p => p.platform) });
  } catch (error) {
    console.error('Platforms fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch platforms' }, { status: 500 });
  }
}
