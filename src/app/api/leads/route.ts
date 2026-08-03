import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const branch = searchParams.get('branch') || '';
    const primaryOrder = (searchParams.get('primaryOrder') || searchParams.get('primarySort') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    let secondaryField = searchParams.get('secondaryField') || searchParams.get('sortBy') || searchParams.get('sortField') || 'name';
    if (secondaryField === 'createdAt' || secondaryField === 'date') {
      secondaryField = 'name';
    }

    const rawSecondaryOrder = searchParams.get('secondaryOrder') || searchParams.get('sortOrder') || searchParams.get('sort') || 'asc';
    const secondaryOrder: 'asc' | 'desc' = rawSecondaryOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const city = searchParams.get('city') || '';
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
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
        { adname: { contains: search } },
        { branch: { contains: search } },
      ];
    }
    
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
    
    if (city) {
      where.city = { contains: city };
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
    
    const [leads, total, statusCounts] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
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
