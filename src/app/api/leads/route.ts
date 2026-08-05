import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    
    // Enforce assigned branch if user is non-admin and assigned to a branch
    const requestedBranch = searchParams.get('branch') || '';
    const branch = currentUser?.role !== 'ADMIN' && currentUser?.assignedBranch
      ? currentUser.assignedBranch
      : requestedBranch;

    const primaryOrder = (searchParams.get('primaryOrder') || searchParams.get('primarySort') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    let secondaryField = searchParams.get('secondaryField') || searchParams.get('sortBy') || searchParams.get('sortField') || 'name';
    if (secondaryField === 'createdAt' || secondaryField === 'date') {
      secondaryField = 'name';
    }

    const rawSecondaryOrder = searchParams.get('secondaryOrder') || searchParams.get('sortOrder') || searchParams.get('sort') || 'asc';
    const secondaryOrder: 'asc' | 'desc' = rawSecondaryOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const city = searchParams.get('city') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const validFields = ['name', 'city', 'adname', 'branch', 'status', 'phone', 'email', 'followUpDate1', 'followUpDate2'];
    if (!validFields.includes(secondaryField)) {
      secondaryField = 'name';
    }

    const orderBy = [
      { createdAt: primaryOrder as 'asc' | 'desc' },
      { [secondaryField]: secondaryOrder },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statsWhere: any = {};

    // Soft delete filter: Exclude leads hidden by this user
    if (currentUser?.userId) {
      const hiddenRecords = await prisma.$queryRaw<{ leadId: number }[]>`
        SELECT "leadId" FROM "HiddenLead" WHERE "userId" = ${currentUser.userId}
      `;
      if (hiddenRecords.length > 0) {
        statsWhere.id = { notIn: hiddenRecords.map(r => r.leadId) };
      }
    }
    
    if (startDate || endDate) {
      statsWhere.createdAt = {};
      if (startDate) {
        statsWhere.createdAt.gte = new Date(`${startDate}T00:00:00+05:30`);
      }
      if (endDate) {
        statsWhere.createdAt.lte = new Date(`${endDate}T23:59:59.999+05:30`);
      }
    }
    
    if (search.trim()) {
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      const searchConditions = tokens.map(token => {
        const tokenDigits = token.replace(/\D/g, '');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields: any[] = [
          { name: { contains: token, mode: 'insensitive' } },
          { phone: { contains: token, mode: 'insensitive' } },
          { email: { contains: token, mode: 'insensitive' } },
          { city: { contains: token, mode: 'insensitive' } },
          { adname: { contains: token, mode: 'insensitive' } },
          { branch: { contains: token, mode: 'insensitive' } },
          { remark: { contains: token, mode: 'insensitive' } },
        ];
        if (tokenDigits && tokenDigits.length >= 3) {
          fields.push({ phone: { contains: tokenDigits, mode: 'insensitive' } });
        }
        return { OR: fields };
      });

      statsWhere.AND = [
        ...(statsWhere.AND || []),
        ...searchConditions
      ];
    }
    
    if (city) {
      statsWhere.city = { contains: city, mode: 'insensitive' };
    }
    
    if (branch) {
      const words = branch.split(' ').filter(Boolean);
      if (words.length > 0) {
        statsWhere.AND = [
          ...(statsWhere.AND || []),
          ...words.map(w => ({ branch: { contains: w, mode: 'insensitive' } }))
        ];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { ...statsWhere };
    if (status) {
      if (status === 'pending' || status === 'created') {
        where.status = { in: ['pending', 'created'] };
      } else if (status === 'live' || status === 'closed_successful') {
        where.status = { in: ['live', 'closed_successful'] };
      } else if (status === 'lost' || status === 'closed_unsuccessful') {
        where.status = { in: ['lost', 'closed_unsuccessful'] };
      } else {
        where.status = status;
      }
    }
    
    const [leads, total, statusCounts] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          city: true,
          adname: true,
          branch: true,
          followUpDate1: true,
          followUpDate2: true,
          remark: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
        where: status ? where : statsWhere,
        by: ['status'],
        _count: {
          status: true,
        },
      }),
    ]);
    
    let totalLeads = 0;
    let pendingLeads = 0;
    let liveLeads = 0;
    let lostLeads = 0;

    statusCounts.forEach((group) => {
      const count = group._count.status;
      totalLeads += count;
      if (['pending', 'created'].includes(group.status)) {
        pendingLeads += count;
      } else if (['live', 'closed_successful'].includes(group.status)) {
        liveLeads += count;
      } else if (['lost', 'closed_unsuccessful'].includes(group.status)) {
        lostLeads += count;
      }
    });
    
    return NextResponse.json({
      leads,
      userRole: currentUser?.role || 'USER',
      assignedBranch: currentUser?.assignedBranch || null,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalLeads,
        pending: pendingLeads,
        live: liveLeads,
        lost: lostLeads,
        open: pendingLeads,
        closedSuccessful: liveLeads,
        closedUnsuccessful: lostLeads,
      },
    });
  } catch (error) {
    console.error('Leads fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { count } = await prisma.lead.deleteMany();
    return NextResponse.json({ cleared: count });
  } catch (error) {
    console.error('Clear leads error:', error);
    return NextResponse.json(
      { error: 'Failed to clear database leads' },
      { status: 500 }
    );
  }
}
