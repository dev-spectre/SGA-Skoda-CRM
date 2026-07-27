import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const platform = searchParams.get('platform') || '';
    const sort = searchParams.get('sort') || 'desc';
    const city = searchParams.get('city') || '';
    const branch = searchParams.get('branch') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
        { zipCode: { contains: search } },
      ];
    }
    
    if (status) {
      where.status = status;
    }
    
    if (platform) {
      where.platform = platform;
    }
    
    if (city) {
      where.city = { contains: city };
    }
    
    if (branch) {
      where.assignedBranch = branch;
    }
    
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: sort as 'asc' | 'desc' },
        skip,
        take: limit,
      }),
      prisma.lead.count({ where }),
    ]);
    
    const [totalLeads, openLeads, closedSuccessful, closedUnsuccessful] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: 'created' } }),
      prisma.lead.count({ where: { status: 'closed_successful' } }),
      prisma.lead.count({ where: { status: 'closed_unsuccessful' } }),
    ]);
    
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
        open: openLeads,
        closedSuccessful,
        closedUnsuccessful,
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
