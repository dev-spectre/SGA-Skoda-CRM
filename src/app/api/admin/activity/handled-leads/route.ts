import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { resolveLeadHandler } from '@/lib/activity';

function normalize(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const userIdParam = searchParams.get('userId');
    const type = searchParams.get('type') || 'handled'; // 'handled' | 'uploaded'
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;

    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();

    // Fetch all non-superadmin users
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            username: {
              notIn: [superUsername, 'sudo'],
              mode: 'insensitive',
            },
          },
          {
            role: {
              not: 'SUPERADMIN',
            },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        role: true,
        assignedBranch: true,
        assignedPlatform: true,
      },
    });

    const userById = new Map<number, (typeof users)[0]>();
    const userByName = new Map<string, (typeof users)[0]>();
    const staffUsernames = new Set<string>();
    const staffUserById = new Map<number, string>();

    for (const u of users) {
      userById.set(u.id, u);
      const norm = normalize(u.username);
      userByName.set(norm, u);
      staffUsernames.add(norm);
      staffUserById.set(u.id, u.username);
    }

    let targetUser: (typeof users)[0] | null = null;
    if (userIdParam) {
      const parsedUserId = parseInt(userIdParam);
      if (!isNaN(parsedUserId)) {
        targetUser = userById.get(parsedUserId) || null;
      }
    }

    if (userIdParam && !targetUser) {
      return NextResponse.json({ error: 'User not found or hidden' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = {};

    if (type === 'uploaded') {
      if (targetUser) {
        where.uploadedById = targetUser.id;
      } else {
        where.uploadedById = { not: null };
      }
    }

    if (status) {
      const statusTokens = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statusTokens.length > 0) {
        const dbStatuses = new Set<string>();
        statusTokens.forEach(st => {
          if (st === 'not_contacted' || st === 'created') {
            dbStatuses.add('not_contacted');
            dbStatuses.add('created');
          } else if (st === 'pending') {
            dbStatuses.add('pending');
          } else if (st === 'live' || st === 'closed_successful') {
            dbStatuses.add('live');
            dbStatuses.add('closed_successful');
          } else if (st === 'lost' || st === 'closed_unsuccessful') {
            dbStatuses.add('lost');
            dbStatuses.add('closed_unsuccessful');
          } else {
            dbStatuses.add(st);
          }
        });
        where.status = { in: Array.from(dbStatuses) };
      }
    }

    if (search.trim()) {
      const q = search.trim();
      const searchOR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { remark: { contains: q, mode: 'insensitive' } },
        { branch: { contains: q, mode: 'insensitive' } },
        { assignedConsultant: { contains: q, mode: 'insensitive' } },
      ];

      if (where.OR) {
        where = {
          AND: [
            { OR: where.OR },
            { OR: searchOR },
          ],
        };
      } else {
        where.OR = searchOR;
      }
    }

    // Fetch candidate leads and chronological activity logs
    const [allCandidateLeads, userActivities] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          adname: true,
          branch: true,
          platform: true,
          status: true,
          testDrive: true,
          assignedConsultant: true,
          followUpDate1: true,
          followUpDate2: true,
          remark: true,
          source: true,
          uploadedById: true,
          uploadedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { activities: true },
          },
        },
      }),
      prisma.leadActivity.findMany({
        where: {
          username: {
            notIn: [superUsername, 'sudo'],
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          leadId: true,
          userId: true,
          username: true,
          action: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
    ]);

    // Group activities by lead
    const activitiesByLead = new Map<number, typeof userActivities>();
    for (const act of userActivities) {
      const list = activitiesByLead.get(act.leadId) || [];
      list.push(act);
      activitiesByLead.set(act.leadId, list);
    }

    // Compute unique active handler for each lead
    const leadsWithHandler = allCandidateLeads.map((lead) => {
      const leadActs = activitiesByLead.get(lead.id) || [];
      const handledByUsername = resolveLeadHandler(lead, leadActs, staffUsernames, staffUserById);

      return {
        ...lead,
        handledBy: handledByUsername,
      };
    });

    // If viewing handled leads for a specific user, filter strictly to leads where targetUser is the active handler
    let filteredLeads = leadsWithHandler;
    if (type === 'handled' && targetUser) {
      filteredLeads = leadsWithHandler.filter((l) => l.handledBy === targetUser!.username);
    }

    const total = filteredLeads.length;
    const paginatedLeads = filteredLeads.slice(skip, skip + limit);

    return NextResponse.json({
      user: targetUser,
      leads: paginatedLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Handled leads fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch handled leads' }, { status: 500 });
  }
}
