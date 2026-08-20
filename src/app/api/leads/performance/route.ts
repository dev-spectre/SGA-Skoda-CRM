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

    // Key by consultant DB id — guaranteed unique even across same-name consultants
    const consultantStats = new Map<number, {
      id: number;
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

    // Pre-initialize all registered consultants
    registeredConsultants.forEach((c: any) => {
      consultantStats.set(c.id, {
        id: c.id,
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

    // Build lookup: name (lowercase) -> array of consultant ids
    // Leads only store consultant name (not branch), so we need this reverse mapping.
    const nameToIds = new Map<string, number[]>();
    for (const c of registeredConsultants) {
      const nameLower = c.name.toLowerCase();
      if (!nameToIds.has(nameLower)) nameToIds.set(nameLower, []);
      nameToIds.get(nameLower)!.push(c.id);
    }

    // Process aggregated groups
    for (const group of leadGroups) {
      if (!group.assignedConsultant || group.assignedConsultant.trim() === '') continue;
      const nameLower = group.assignedConsultant.trim().toLowerCase();

      const ids = nameToIds.get(nameLower);
      if (!ids || ids.length === 0) continue; // not a registered consultant

      const count = group._count.id;

      // If the name is unique across branches, attribute directly.
      // If shared across multiple branches, split evenly.
      const splitCount = count / ids.length;

      for (const id of ids) {
        const stats = consultantStats.get(id)!;
        stats.total += splitCount;

        const status = group.status;
        if (status === 'not_contacted' || status === 'created') {
          stats.notContacted += splitCount;
        } else if (status === 'pending') {
          stats.pending += splitCount;
        } else if (status === 'live' || status === 'closed_successful') {
          stats.live += splitCount;
        } else if (status === 'lost' || status === 'closed_unsuccessful') {
          stats.lost += splitCount;
        }

        const td = group.testDrive;
        if (td === 'Scheduled' || td === 'Completed' || td === 'Yes') {
          stats.testDriveYes += splitCount;
        } else {
          stats.testDriveNo += splitCount;
        }
      }
    }

    // Round fractional counts to integers and sort by total desc
    const performanceData = Array.from(consultantStats.values())
      .map(s => ({
        ...s,
        total: Math.round(s.total),
        notContacted: Math.round(s.notContacted),
        pending: Math.round(s.pending),
        live: Math.round(s.live),
        lost: Math.round(s.lost),
        testDriveYes: Math.round(s.testDriveYes),
        testDriveNo: Math.round(s.testDriveNo),
      }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({ performance: performanceData });

  } catch (error) {
    console.error('Failed to fetch performance stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
