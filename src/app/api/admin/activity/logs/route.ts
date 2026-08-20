import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/activity';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    // CRITICAL REQUIREMENT: Admin does not have access to logs, only Superadmin can view logs
    const isSuper = currentUser && isSuperAdminUser(currentUser);
    if (!isSuper) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Superadmin can view activity and audit logs.' },
        { status: 403 }
      );
    }

    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
    const searchParams = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30')));
    const skip = (page - 1) * limit;

    const userId = searchParams.get('userId');
    const leadId = searchParams.get('leadId');
    const action = searchParams.get('action');
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      username: {
        notIn: [superUsername, 'sudo'],
        mode: 'insensitive',
      },
    };

    if (userId) {
      const parsedUserId = parseInt(userId);
      if (!isNaN(parsedUserId)) {
        where.userId = parsedUserId;
      }
    }

    if (leadId) {
      const parsedLeadId = parseInt(leadId);
      if (!isNaN(parsedLeadId)) {
        where.leadId = parsedLeadId;
      }
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00+05:30`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999+05:30`);
      }
    }

    if (search.trim()) {
      const q = search.trim();
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { oldValue: { contains: q, mode: 'insensitive' } },
        { newValue: { contains: q, mode: 'insensitive' } },
        { lead: { name: { contains: q, mode: 'insensitive' } } },
        { lead: { phone: { contains: q, mode: 'insensitive' } } },
        { lead: { branch: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.leadActivity.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              city: true,
              branch: true,
              platform: true,
              status: true,
              assignedConsultant: true,
              testDrive: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              assignedBranch: true,
            },
          },
        },
      }),
      prisma.leadActivity.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Audit logs fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 });
  }
}
