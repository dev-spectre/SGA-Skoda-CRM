import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { resolveLeadHandler } from '@/lib/activity';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    
    // Enforce assigned branch if user is non-admin and assigned to a branch
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN' || Boolean(currentUser?.isSuperAdmin);
    const requestedBranch = searchParams.get('branch') || '';
    const branch = !isAdmin && currentUser?.assignedBranch
      ? currentUser.assignedBranch
      : requestedBranch;

    // Platform assignment - no restriction enforced; all users can view leads

    const requestedPlatform = searchParams.get('platform') || '';
    const platform = !isAdmin && currentUser?.assignedPlatform
      ? currentUser.assignedPlatform
      : requestedPlatform;


    const primaryOrder = (searchParams.get('primaryOrder') || searchParams.get('primarySort') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    let secondaryField = searchParams.get('secondaryField') || searchParams.get('sortBy') || searchParams.get('sortField') || 'name';
    if (secondaryField === 'createdAt' || secondaryField === 'date') {
      secondaryField = 'name';
    }

    const rawSecondaryOrder = searchParams.get('secondaryOrder') || searchParams.get('sortOrder') || searchParams.get('sort') || 'asc';
    const secondaryOrder: 'asc' | 'desc' = rawSecondaryOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const city = searchParams.get('city') || '';
    const consultant = searchParams.get('consultant') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const validFields = ['name', 'city', 'adname', 'branch', 'status', 'phone', 'followUpDate1', 'followUpDate2'];
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
      const hiddenRecords = await prisma.hiddenLead.findMany({
        where: { userId: currentUser.userId },
        select: { leadId: true },
      });
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
      const branchTokens = branch.split(',').map(b => b.trim()).filter(Boolean);
      if (branchTokens.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const branchConditions: any[] = branchTokens.map(b => {
          const words = b.split(/\s+/).filter(Boolean);
          if (words.length > 1) {
            return { AND: words.map(w => ({ branch: { contains: w, mode: 'insensitive' } })) };
          }
          return { branch: { contains: b, mode: 'insensitive' } };
        });
        statsWhere.AND = [
          ...(statsWhere.AND || []),
          { OR: branchConditions }
        ];
      }
    }

    // Apply platform filter — supports comma-separated multi-select values and label→DB mapping
    if (platform) {
      const platformTokens = platform.split(',').map((p: string) => p.trim()).filter(Boolean);
      if (platformTokens.length > 0) {
        // Map display labels to DB values
        const mapPlatformValue = (val: string): string[] => {
          const lower = val.toLowerCase();
          if (lower === 'facebook' || lower === 'fb') return ['Fb'];
          if (lower === 'instagram' || lower === 'ig') return ['Ig'];
          if (lower === 'meta ads') return ['Fb', 'Ig'];
          return [val];
        };
        const dbPlatforms = Array.from(new Set(platformTokens.flatMap(mapPlatformValue)));
        if (dbPlatforms.length === 1) {
          statsWhere.platform = dbPlatforms[0];
        } else {
          statsWhere.AND = [
            ...(statsWhere.AND || []),
            { platform: { in: dbPlatforms } }
          ];
        }
      }
    }

    if (consultant) {
      const consultantTokens = consultant.split(',').map(c => c.trim()).filter(Boolean);
      if (consultantTokens.length > 0) {
        const consultantConditions: any[] = [];
        consultantTokens.forEach(c => {
          if (c === 'Unassigned') {
            consultantConditions.push({ assignedConsultant: null }, { assignedConsultant: '' });
          } else {
            consultantConditions.push({ assignedConsultant: c });
          }
        });
        statsWhere.AND = [
          ...(statsWhere.AND || []),
          { OR: consultantConditions }
        ];
      }
    }

    const testDrive = searchParams.get('testDrive') || '';
    if (testDrive) {
      const tdTokens = testDrive.split(',').map(s => s.trim()).filter(Boolean);
      if (tdTokens.length > 0) {
        const testDriveConditions: any[] = [];
        tdTokens.forEach(td => {
          if (td === 'Not Scheduled') {
            testDriveConditions.push(
              { testDrive: null },
              { testDrive: '' },
              { testDrive: 'Not Scheduled' },
              { testDrive: 'No' }
            );
          } else if (td === 'Scheduled') {
            testDriveConditions.push(
              { testDrive: 'Scheduled' },
              { testDrive: 'Yes' }
            );
          } else {
            testDriveConditions.push({ testDrive: td });
          }
        });
        statsWhere.AND = [
          ...(statsWhere.AND || []),
          { OR: testDriveConditions }
        ];
      }
    }

    const uploadedById = searchParams.get('uploadedById');
    if (uploadedById) {
      const parsedId = parseInt(uploadedById);
      if (!isNaN(parsedId)) {
        statsWhere.uploadedById = parsedId;
      }
    }

    const uploader = searchParams.get('uploader');
    if (uploader) {
      const uploaderTokens = uploader.split(',').map(u => u.trim()).filter(Boolean);
      if (uploaderTokens.length > 0) {
        const uploaderConditions: any[] = [];
        uploaderTokens.forEach(u => {
          if (u === 'system' || u === 'sheet') {
            uploaderConditions.push({ source: { not: 'External Upload' } });
          } else if (u === 'external') {
            uploaderConditions.push({ source: 'External Upload' });
          } else if (u.startsWith('user:')) {
            const username = u.replace('user:', '').trim();
            uploaderConditions.push({ uploadedBy: { username: { equals: username, mode: 'insensitive' } } });
          } else {
            uploaderConditions.push({ uploadedBy: { username: { equals: u, mode: 'insensitive' } } });
          }
        });
        statsWhere.AND = [
          ...(statsWhere.AND || []),
          { OR: uploaderConditions }
        ];
      }
    }

    const source = searchParams.get('source');
    if (source) {
      if (source === 'External Upload' || source === 'external') {
        statsWhere.source = 'External Upload';
      } else if (source === 'System' || source === 'system' || source === 'sheet') {
        statsWhere.source = { not: 'External Upload' };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { ...statsWhere };
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
    
    const [leads, total, statusCounts, maxAggregate] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        skip,
        take: limit,
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
      }),
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
        where: status ? where : statsWhere,
        by: ['status'],
        _count: {
          status: true,
        },
      }),
      prisma.lead.aggregate({
        where,
        _max: {
          updatedAt: true,
        },
      }),
    ]);
    
    let totalLeads = 0;
    let notContactedLeads = 0;
    let pendingLeads = 0;
    let liveLeads = 0;
    let lostLeads = 0;

    statusCounts.forEach((group) => {
      const count = group._count.status;
      totalLeads += count;
      if (group.status === 'not_contacted' || group.status === 'created') {
        notContactedLeads += count;
      } else if (group.status === 'pending') {
        pendingLeads += count;
      } else if (['live', 'closed_successful'].includes(group.status)) {
        liveLeads += count;
      } else if (['lost', 'closed_unsuccessful'].includes(group.status)) {
        lostLeads += count;
      }
    });

    const maxUpdatedAt = maxAggregate._max.updatedAt || null;
    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
    const leadIds = leads.map((l) => l.id);

    const [staffUsers, recentActivities] = await Promise.all([
      prisma.user.findMany({
        where: {
          AND: [
            { username: { notIn: [superUsername, 'sudo'], mode: 'insensitive' } },
            { role: { not: 'SUPERADMIN' } },
          ],
        },
        select: { id: true, username: true },
      }),
      leadIds.length > 0
        ? prisma.leadActivity.findMany({
            where: {
              leadId: { in: leadIds },
              username: {
                notIn: [superUsername, 'sudo'],
                mode: 'insensitive',
              },
            },
            orderBy: {
              createdAt: 'asc',
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
          })
        : [],
    ]);

    const staffUsernames = new Set<string>();
    const staffUserById = new Map<number, string>();
    for (const u of staffUsers) {
      staffUsernames.add(u.username.trim().toLowerCase());
      staffUserById.set(u.id, u.username);
    }

    const activitiesByLead = new Map<number, typeof recentActivities>();
    for (const act of recentActivities) {
      const list = activitiesByLead.get(act.leadId) || [];
      list.push(act);
      activitiesByLead.set(act.leadId, list);
    }

    const enrichedLeads = leads.map((l) => {
      const leadActs = activitiesByLead.get(l.id) || [];
      const handler = resolveLeadHandler(l, leadActs, staffUsernames, staffUserById);
      return {
        ...l,
        handledBy: handler,
      };
    });

    return NextResponse.json({
      leads: enrichedLeads,
      maxUpdatedAt: maxUpdatedAt ? maxUpdatedAt.toISOString() : null,
      userRole: currentUser?.role || 'USER',
      assignedBranch: currentUser?.assignedBranch || null,
      assignedPlatform: currentUser?.assignedPlatform || null,
      allowExternalUpload: Boolean(currentUser?.allowExternalUpload || currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN' || currentUser?.isSuperAdmin),

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalLeads,
        notContacted: notContactedLeads,
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
    const currentUser = await getCurrentUser();
    const isSuper = currentUser && (currentUser.isSuperAdmin || currentUser.role === 'SUPERADMIN' || currentUser.username === (process.env.SUPERADMIN_USERNAME || 'sudo'));

    if (!isSuper) {
      return NextResponse.json({ error: 'Unauthorized. Only Superadmin can delete leads.' }, { status: 403 });
    }

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

