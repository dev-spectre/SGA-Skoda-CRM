import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseBranches } from '@/lib/utils';

export async function GET() {
  try {
    const [rawLeadBranches, rawConsultants, rawUsers] = await Promise.all([
      prisma.lead.findMany({
        select: { branch: true },
        distinct: ['branch'],
        where: { branch: { not: '' } },
      }),
      prisma.consultant.findMany({
        select: { branch: true },
        distinct: ['branch'],
        where: { branch: { not: '' } },
      }),
      prisma.user.findMany({
        select: { assignedBranch: true },
        distinct: ['assignedBranch'],
        where: { assignedBranch: { not: null } },
      }),
    ]);

    const branchMap = new Map<string, string>();

    const addBranch = (raw: string | null | undefined) => {
      if (!raw) return;
      parseBranches(raw).forEach(clean => {
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!branchMap.has(key)) {
          branchMap.set(key, clean);
        } else {
          // If clean has all-uppercase acronym (like MTP), prefer it
          if (clean === clean.toUpperCase()) {
            branchMap.set(key, clean);
          }
        }
      });
    };

    rawLeadBranches.forEach(b => addBranch(b.branch));
    rawConsultants.forEach((c: any) => addBranch(c.branch));
    rawUsers.forEach(u => addBranch(u.assignedBranch));

    return NextResponse.json({ branches: Array.from(branchMap.values()).sort((a, b) => a.localeCompare(b)) });

  } catch (error) {
    console.error('Branches fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
  }
}
