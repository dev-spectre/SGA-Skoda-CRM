import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const rawPlatforms = await prisma.lead.findMany({
      select: { platform: true },
      distinct: ['platform'],
      where: { platform: { not: null } },
    });

    const uniquePlatforms = Array.from(
      new Set(rawPlatforms.map((p) => p.platform?.trim()).filter(Boolean))
    ).sort();

    return NextResponse.json({ platforms: uniquePlatforms });
  } catch (error) {
    console.error('Platforms fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch platforms' }, { status: 500 });
  }
}
