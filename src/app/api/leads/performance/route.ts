import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }


    // High performance query: Fetch registered consultants and DB-grouped lead metrics
    const [registeredConsultants, leadGroups] = await Promise.all([
      prisma.consultant.findMany({
        orderBy: [{ branch: 'asc' }, { name: 'asc' }],
      }),
      prisma.lead.groupBy({
        by: ['assignedConsultant', 'status', 'testDrive'],
        _count: { id: true },
      }),
    ]);

    // Map of consultant name (case-insensitive key) to branch
    const branchMap = new Map<string, string>();
    registeredConsultants.forEach((c: any) => {
      branchMap.set(c.name.toLowerCase(), c.branch);
    });

    const consultantStats = new Map<string, {
      consultant: string;
      branch: string;
      total: number;
      notContacted: number;
      pending: number;
      live: number;
      lost: number;
      testDriveYes: number;
      testDriveNo: number;
    }>();

    // Pre-initialize registered consultants
    registeredConsultants.forEach((c: any) => {
      consultantStats.set(c.name.toLowerCase(), {
        consultant: c.name,
        branch: c.branch,
        total: 0,
        notContacted: 0,
        pending: 0,
        live: 0,
        lost: 0,
        testDriveYes: 0,
        testDriveNo: 0,
      });
    });


    // Process aggregated groups (strictly for registered consultants)
    for (const group of leadGroups) {
      if (!group.assignedConsultant || group.assignedConsultant.trim() === '') continue;
      const key = group.assignedConsultant.trim().toLowerCase();

      // Only include consultants who exist in Manage Consultants
      if (!consultantStats.has(key)) continue;

      const stats = consultantStats.get(key)!;
      const count = group._count.id;
      stats.total += count;

      const status = group.status;
      if (status === 'not_contacted' || status === 'created') {
        stats.notContacted += count;
      } else if (status === 'pending') {
        stats.pending += count;
      } else if (status === 'live' || status === 'closed_successful') {
        stats.live += count;
      } else if (status === 'lost' || status === 'closed_unsuccessful') {
        stats.lost += count;
      }

      const td = group.testDrive;
      if (td === 'Scheduled' || td === 'Completed' || td === 'Yes') {
        stats.testDriveYes += count;
      } else {
        stats.testDriveNo += count;
      }
    }

    const performanceData = Array.from(consultantStats.values()).sort((a, b) => {
      return b.total - a.total;
    });

    return NextResponse.json({ performance: performanceData });

  } catch (error) {
    console.error('Failed to fetch performance stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
