import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseBranches } from '@/lib/utils';

export async function GET() {
  try {
    const rawBranches = await prisma.lead.findMany({
      select: { branch: true },
      distinct: ['branch'],
      where: { branch: { not: '' } },
    });

    const uniqueBranches = new Set<string>();
    rawBranches.forEach(b => {
      if (b.branch) {
        parseBranches(b.branch).forEach(clean => uniqueBranches.add(clean));
      }
    });

    return NextResponse.json({ branches: Array.from(uniqueBranches).sort() });
  } catch (error) {
    console.error('Branches fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
  }
}
