import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const branchParam = searchParams.get('branch');

    const where: any = {};
    if (branchParam && branchParam.trim()) {
      where.branch = { equals: branchParam.trim(), mode: 'insensitive' };
    }

    const consultants = await prisma.consultant.findMany({
      where,
      orderBy: [
        { branch: 'asc' },
        { name: 'asc' },
      ],
    });

    // Also get lead count per consultant
    const leadCounts = await prisma.lead.groupBy({
      by: ['assignedConsultant'],
      where: {
        assignedConsultant: { not: null },
      },
      _count: { id: true },
    });

    const leadCountMap = new Map<string, number>();
    leadCounts.forEach(lc => {
      if (lc.assignedConsultant) {
        leadCountMap.set(lc.assignedConsultant.toLowerCase(), lc._count.id);
      }
    });

    const enrichedConsultants = consultants.map((c: any) => ({
      ...c,
      leadsCount: leadCountMap.get(c.name.toLowerCase()) || 0,
    }));


    return NextResponse.json({ consultants: enrichedConsultants });
  } catch (error) {
    console.error('Failed to fetch consultants:', error);
    return NextResponse.json({ error: 'Failed to fetch consultants' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }


    const body = await request.json();
    const { name, branch } = body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedBranch = typeof branch === 'string' ? branch.trim() : '';

    if (!trimmedName) {
      return NextResponse.json({ error: 'Consultant name is required' }, { status: 400 });
    }

    if (!trimmedBranch) {
      return NextResponse.json({ error: 'Assigned branch is required' }, { status: 400 });
    }

    // Check for existing consultant with the same name and branch (case-insensitive)
    const existing = await prisma.consultant.findFirst({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
        branch: { equals: trimmedBranch, mode: 'insensitive' },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Consultant "${trimmedName}" is already assigned to ${trimmedBranch}` },
        { status: 409 }
      );
    }

    const consultant = await prisma.consultant.create({
      data: {
        name: trimmedName,
        branch: trimmedBranch,
      },
    });

    return NextResponse.json({ consultant }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create consultant:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create consultant' }, { status: 500 });
  }
}
