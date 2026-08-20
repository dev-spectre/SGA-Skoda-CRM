import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { parsePhoneNumber } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);

    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get('since');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const consultant = searchParams.get('consultant') || '';
    const branchParam = searchParams.get('branch') || '';
    const testDrive = searchParams.get('testDrive') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const uploader = searchParams.get('uploader');
    const uploadedById = searchParams.get('uploadedById');
    const source = searchParams.get('source');

    // Build filter matching active user view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Branch scoping
    let branch = branchParam;
    if (!isAdmin && currentUser?.assignedBranch) {
      branch = currentUser.assignedBranch;
    }

    if (search) {
      const cleanPhone = parsePhoneNumber(search);
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: cleanPhone || search } },
        { city: { contains: search, mode: 'insensitive' } },
        { adname: { contains: search, mode: 'insensitive' } },
        { remark: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00+05:30`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999+05:30`);
      }
    }

    if (branch) {
      const words = branch.split(' ').filter(Boolean);
      if (words.length > 0) {
        where.AND = [
          ...(where.AND || []),
          ...words.map(w => ({ branch: { contains: w, mode: 'insensitive' } }))
        ];
      }
    }

    if (consultant) {
      if (consultant === 'Unassigned') {
        where.OR = [
          { assignedConsultant: null },
          { assignedConsultant: '' }
        ];
      } else {
        where.assignedConsultant = consultant;
      }
    }

    if (testDrive) {
      if (testDrive === 'Not Scheduled') {
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { testDrive: null },
              { testDrive: '' },
              { testDrive: 'Not Scheduled' },
              { testDrive: 'No' },
            ]
          }
        ];
      } else if (testDrive === 'Scheduled') {
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { testDrive: 'Scheduled' },
              { testDrive: 'Yes' },
            ]
          }
        ];
      } else {
        where.testDrive = testDrive;
      }
    }

    if (uploadedById) {
      const parsedId = parseInt(uploadedById);
      if (!isNaN(parsedId)) {
        where.uploadedById = parsedId;
      }
    }

    if (uploader) {
      where.uploadedBy = { username: { equals: uploader.trim(), mode: 'insensitive' } };
    }

    if (source) {
      if (source === 'External Upload' || source === 'external') {
        where.source = 'External Upload';
      } else if (source === 'System' || source === 'system' || source === 'sheet') {
        where.source = { not: 'External Upload' };
      }
    }

    if (status) {
      if (status === 'not_contacted' || status === 'created') {
        where.status = { in: ['not_contacted', 'created'] };
      } else if (status === 'pending') {
        where.status = 'pending';
      } else if (status === 'live' || status === 'closed_successful') {
        where.status = { in: ['live', 'closed_successful'] };
      } else if (status === 'lost' || status === 'closed_unsuccessful') {
        where.status = { in: ['lost', 'closed_unsuccessful'] };
      } else {
        where.status = status;
      }
    }

    // Step 1: Lightweight aggregate check
    const aggregate = await prisma.lead.aggregate({
      where,
      _count: true,
      _max: {
        updatedAt: true,
      },
    });

    const count = aggregate._count || 0;
    const lastUpdated = aggregate._max.updatedAt || null;

    // If client provided a 'since' timestamp, check if anything changed
    if (since && lastUpdated) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        // If DB max updatedAt is <= client's timestamp, nothing has changed!
        if (lastUpdated.getTime() <= sinceDate.getTime()) {
          return NextResponse.json({
            hasChanges: false,
            changedLeads: [],
            count,
            lastUpdated: lastUpdated.toISOString(),
          });
        }

        // Fetch changed leads and fresh stats in parallel
        const [changedLeads, statusCounts] = await Promise.all([
          prisma.lead.findMany({
            where: {
              ...where,
              updatedAt: { gt: sinceDate },
            },
            select: {
              id: true,
              name: true,
              phone: true,
              city: true,
              adname: true,
              branch: true,
              followUpDate1: true,
              followUpDate2: true,
              remark: true,
              status: true,
              testDrive: true,
              assignedConsultant: true,
              platform: true,
              source: true,
              uploadedById: true,
              uploadedBy: {
                select: { id: true, username: true }
              },
              uploadedAt: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 50,
          }),
          prisma.lead.groupBy({
            where,
            by: ['status'],
            _count: {
              status: true,
            },
          }),
        ]);

        if (changedLeads.length === 0) {
          return NextResponse.json({
            hasChanges: false,
            changedLeads: [],
            count,
            lastUpdated: lastUpdated.toISOString(),
          });
        }

        let totalLeads = 0;
        let notContactedLeads = 0;
        let pendingLeads = 0;
        let liveLeads = 0;
        let lostLeads = 0;

        statusCounts.forEach((group) => {
          const c = group._count.status;
          totalLeads += c;
          if (group.status === 'not_contacted' || group.status === 'created') {
            notContactedLeads += c;
          } else if (group.status === 'pending') {
            pendingLeads += c;
          } else if (['live', 'closed_successful'].includes(group.status)) {
            liveLeads += c;
          } else if (['lost', 'closed_unsuccessful'].includes(group.status)) {
            lostLeads += c;
          }
        });

        const stats = {
          total: totalLeads,
          notContacted: notContactedLeads,
          pending: pendingLeads,
          live: liveLeads,
          lost: lostLeads,
          open: pendingLeads,
          closedSuccessful: liveLeads,
          closedUnsuccessful: lostLeads,
        };

        return NextResponse.json({
          hasChanges: true,
          changedLeads,
          count: totalLeads,
          stats,
          lastUpdated: lastUpdated.toISOString(),
        });
      }
    }

    // Default response if no 'since' provided
    return NextResponse.json({
      hasChanges: true,
      changedLeads: [],
      count,
      lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
    });
  } catch (error: any) {
    console.error('Leads check warning (transient network/DB error):', error?.message || error);
    return NextResponse.json({
      hasChanges: false,
      changedLeads: [],
      count: 0,
      lastUpdated: null,
      warning: 'Database temporarily unavailable',
    });
  }
}
