import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { resolveLeadHandler, getCachedStaffUsers } from '@/lib/activity';

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

    const rawSecondaryField = searchParams.get('secondaryField') || searchParams.get('sortBy') || searchParams.get('sortField') || '';
    const secondaryField = (rawSecondaryField === 'createdAt' || rawSecondaryField === 'date') ? '' : rawSecondaryField;

    const rawSecondaryOrder = searchParams.get('secondaryOrder') || searchParams.get('sortOrder') || searchParams.get('sort') || 'asc';
    const secondaryOrder: 'asc' | 'desc' = rawSecondaryOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const city = searchParams.get('city') || '';
    const consultant = searchParams.get('consultant') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const followUpDate = searchParams.get('followUpDate') || '';
    const followUpStartDate = searchParams.get('followUpStartDate') || followUpDate;
    const followUpEndDate = searchParams.get('followUpEndDate') || followUpDate;
    const hasFollowUp = searchParams.get('hasFollowUp') === 'true' || searchParams.get('hasFollowUp') === '1' || searchParams.get('onlyFollowUps') === 'true' || Boolean(followUpStartDate || followUpEndDate);
    const fields = searchParams.get('fields') || '';
    const isCalendar = fields === 'calendar';
    const isExport = searchParams.get('export') === 'true';
    const uploadedById = searchParams.get('uploadedById');

    const requestedLimit = parseInt(searchParams.get('limit') || '20');
    const maxAllowedLimit = isExport ? 10000 : (uploadedById ? 1000 : (hasFollowUp ? 100 : 20));
    const limit = Math.min(Math.max(1, isNaN(requestedLimit) ? 20 : requestedLimit), maxAllowedLimit);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const skip = (page - 1) * limit;

    const validFields = ['name', 'city', 'adname', 'branch', 'status', 'phone', 'followUpDate1', 'followUpDate2'];
    let orderBy: any[];
    if (secondaryField && validFields.includes(secondaryField) && secondaryField !== 'createdAt') {
      orderBy = [
        { [secondaryField]: secondaryOrder },
        { createdAt: primaryOrder as 'asc' | 'desc' },
        { id: primaryOrder as 'asc' | 'desc' },
      ];
    } else {
      orderBy = [
        { createdAt: primaryOrder as 'asc' | 'desc' },
        { id: primaryOrder as 'asc' | 'desc' },
      ];
    }

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

    if (followUpStartDate || followUpEndDate) {
      const f1Cond: any = {};
      const f2Cond: any = {};
      const fRelCond: any = {};
      if (followUpStartDate) {
        const startD = new Date(`${followUpStartDate}T00:00:00+05:30`);
        f1Cond.gte = startD;
        f2Cond.gte = startD;
        fRelCond.gte = startD;
      }
      if (followUpEndDate) {
        const endD = new Date(`${followUpEndDate}T23:59:59.999+05:30`);
        f1Cond.lte = endD;
        f2Cond.lte = endD;
        fRelCond.lte = endD;
      }
      statsWhere.AND = [
        ...(statsWhere.AND || []),
        {
          OR: [
            { followUpDate1: f1Cond },
            { followUpDate2: f2Cond },
            { followUps: { some: { date: fRelCond } } },
          ]
        }
      ];
    } else if (hasFollowUp) {
      statsWhere.AND = [
        ...(statsWhere.AND || []),
        {
          OR: [
            { followUpDate1: { not: null } },
            { followUpDate2: { not: null } },
            { followUps: { some: {} } },
            { followUpCount: { gt: 0 } },
          ]
        }
      ];
    }

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

    // Category filter handling (valid, invalid, outside, all, priority)
    const category = (searchParams.get('category') || '').trim().toLowerCase();

    // Fetch active branches for category classification
    const [rawLeadBranches, rawConsultants, rawUsers] = await Promise.all([
      prisma.lead.groupBy({
        by: ['branch'],
        where: { branch: { not: '' } },
      }),
      prisma.consultant.groupBy({
        by: ['branch'],
        where: { branch: { not: '' } },
      }),
      prisma.user.groupBy({
        by: ['assignedBranch'],
        where: { assignedBranch: { not: null } },
      }),
    ]);

    const activeBranchNames: string[] = [];
    const activeBranchSet = new Set<string>();

    const addBranch = (raw: string | null | undefined) => {
      if (!raw) return;
      const cleaned = raw.trim().replace(/[_-]/g, ' ');
      if (!cleaned) return;
      const lower = cleaned.toLowerCase();
      if (!activeBranchSet.has(lower)) {
        activeBranchSet.add(lower);
        activeBranchNames.push(cleaned);
      }
      // Also add SGA variants
      if (!lower.startsWith('sga')) {
        const sgaMotors = `SGA Motors ${cleaned}`;
        const sga = `SGA ${cleaned}`;
        if (!activeBranchSet.has(sgaMotors.toLowerCase())) {
          activeBranchSet.add(sgaMotors.toLowerCase());
          activeBranchNames.push(sgaMotors);
        }
        if (!activeBranchSet.has(sga.toLowerCase())) {
          activeBranchSet.add(sga.toLowerCase());
          activeBranchNames.push(sga);
        }
      }
    };

    (rawLeadBranches as { branch: string | null }[]).forEach((b) => addBranch(b.branch));
    (rawConsultants as { branch: string | null }[]).forEach((c) => addBranch(c.branch));
    (rawUsers as { assignedBranch: string | null }[]).forEach((u) => addBranch(u.assignedBranch));

    const validPhoneCondition: any = {
      isInvalidPhone: false,
    };

    const invalidPhoneCondition: any = {
      isInvalidPhone: true,
    };

    const inStateCondition: any = {
      isOutOfState: false,
    };

    const outOfStateCondition: any = {
      isOutOfState: true,
    };

    const now = new Date();
    const kolkataFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayDateStr = kolkataFormatter.format(now);
    const todayEndOfDay = new Date(`${todayDateStr}T23:59:59.999+05:30`);

    const priorityFollowUpCondition: any = {
      OR: [
        { followUpDate1: { lte: todayEndOfDay, not: null } },
        { followUpDate2: { lte: todayEndOfDay, not: null } },
        { followUps: { some: { date: { lte: todayEndOfDay } } } },
      ],
    };

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
          } else if (st === 'callback') {
            dbStatuses.add('callback');
          } else {
            dbStatuses.add(st);
          }
        });
        where.status = { in: Array.from(dbStatuses) };
      }
    }

    // Apply category filter
    if (category === 'valid') {
      where.AND = [
        ...(where.AND || []),
        validPhoneCondition,
        inStateCondition,
      ];
    } else if (category === 'invalid') {
      where.AND = [
        ...(where.AND || []),
        invalidPhoneCondition,
      ];
    } else if (category === 'outside' || category === 'unassigned') {
      where.AND = [
        ...(where.AND || []),
        validPhoneCondition,
        outOfStateCondition,
      ];
    } else if (category === 'priority') {
      where.AND = [
        ...(where.AND || []),
        validPhoneCondition,
        inStateCondition,
        priorityFollowUpCondition,
      ];
    }

    const skipStats = searchParams.get('skipStats') === 'true' || searchParams.get('skipStats') === '1';
    const skipActivities = searchParams.get('skipActivities') === 'true' || searchParams.get('skipActivities') === '1';

    const leadSelect = isCalendar ? {
      id: true,
      name: true,
      phone: true,
      city: true,
      adname: true,
      branch: true,
      followUpDate1: true,
      followUpDate2: true,
      followUpCount: true,
      followUps: {
        orderBy: { step: 'asc' as const },
        select: { id: true, step: true, date: true, createdAt: true, updatedAt: true },
      },
      remark: true,
      status: true,
      assignedConsultant: true,
      testDrive: true,
      isInvalidPhone: true,
      isOutOfState: true,
      createdAt: true,
      updatedAt: true,
    } : {
      id: true,
      name: true,
      phone: true,
      city: true,
      adname: true,
      branch: true,
      followUpDate1: true,
      followUpDate2: true,
      followUpCount: true,
      followUps: {
        orderBy: { step: 'asc' as const },
        select: { id: true, step: true, date: true, createdAt: true, updatedAt: true },
      },
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
      isInvalidPhone: true,
      isOutOfState: true,
      isBranchManual: true,
      createdAt: true,
      updatedAt: true,
    };

    let leads: any[] = [];
    let total = 0;
    let totalLeads = 0;
    let notContactedLeads = 0;
    let pendingLeads = 0;
    let liveLeads = 0;
    let lostLeads = 0;
    let callbackLeads = 0;
    let maxUpdatedAt: string | null = null;
    let categoryStats = {
      valid: 0,
      invalid: 0,
      outside: 0,
      all: 0,
      priority: 0,
      unassigned: 0,
    };

    const includeTotal = searchParams.get('includeTotal') === 'true' || Boolean(followUpDate || followUpStartDate) || !skipStats;

    if (skipStats) {
      if (includeTotal) {
        const [dbLeads, dbTotal] = await Promise.all([
          prisma.lead.findMany({
            where,
            orderBy,
            ...(isExport ? {} : { skip, take: limit }),
            select: leadSelect,
          }),
          prisma.lead.count({ where }),
        ]);
        leads = dbLeads;
        total = dbTotal;
      } else {
        leads = await prisma.lead.findMany({
          where,
          orderBy,
          ...(isExport ? {} : { skip, take: limit }),
          select: leadSelect,
        });
      }
    } else {
      const [
        dbLeads,
        dbTotal,
        statusCounts,
        maxAggregate,
        validCount,
        invalidCount,
        outsideCount,
        allCount,
        priorityCount,
      ] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy,
          ...(isExport ? {} : { skip, take: limit }),
          select: leadSelect,
        }),
        prisma.lead.count({ where }),
        prisma.lead.groupBy({
          where: status || category ? where : statsWhere,
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
        // 1. Valid: Tamil Nadu leads with valid phone number
        prisma.lead.count({
          where: {
            ...statsWhere,
            AND: [
              ...(statsWhere.AND || []),
              validPhoneCondition,
              inStateCondition,
            ],
          },
        }),
        // 2. Invalid: Leads with invalid phone number
        prisma.lead.count({
          where: {
            ...statsWhere,
            AND: [
              ...(statsWhere.AND || []),
              invalidPhoneCondition,
            ],
          },
        }),
        // 3. Outside: Leads outside Tamil Nadu with valid phone number
        prisma.lead.count({
          where: {
            ...statsWhere,
            AND: [
              ...(statsWhere.AND || []),
              validPhoneCondition,
              outOfStateCondition,
            ],
          },
        }),
        // 4. All leads matching active statsWhere filters
        prisma.lead.count({
          where: statsWhere,
        }),
        // 5. Priority follow-up leads
        prisma.lead.count({
          where: {
            ...statsWhere,
            AND: [
              ...(statsWhere.AND || []),
              validPhoneCondition,
              inStateCondition,
              priorityFollowUpCondition,
            ],
          },
        }),
      ]);

      leads = dbLeads;
      total = dbTotal;
      categoryStats = {
        valid: validCount,
        invalid: invalidCount,
        outside: outsideCount,
        all: allCount,
        priority: priorityCount,
        unassigned: outsideCount,
      };
      if (maxAggregate?._max?.updatedAt) {
        maxUpdatedAt = maxAggregate._max.updatedAt.toISOString();
      }

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
        } else if (group.status === 'callback') {
          callbackLeads += count;
        }
      });
    }

    let enrichedLeads: any[] = leads;

    if (!skipActivities && leads.length > 0) {
      const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
      const leadIds = leads.map((l) => l.id);

      const [{ staffUsernames, staffUserById }, recentActivities] = await Promise.all([
        getCachedStaffUsers(),
        prisma.leadActivity.findMany({
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
        }),
      ]);

      const activitiesByLead = new Map<number, typeof recentActivities>();
      for (const act of recentActivities) {
        const list = activitiesByLead.get(act.leadId) || [];
        list.push(act);
        activitiesByLead.set(act.leadId, list);
      }

      enrichedLeads = leads.map((l) => {
        const leadActs = activitiesByLead.get(l.id) || [];
        const handler = resolveLeadHandler(l, leadActs, staffUsernames, staffUserById);
        return {
          ...l,
          handledBy: handler,
        };
      });
    }

    return NextResponse.json({
      leads: enrichedLeads,
      maxUpdatedAt: maxUpdatedAt || null,
      userRole: currentUser?.role || 'USER',
      assignedBranch: currentUser?.assignedBranch || null,
      assignedPlatform: currentUser?.assignedPlatform || null,
      allowExternalUpload: Boolean(currentUser?.allowExternalUpload || currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN' || currentUser?.isSuperAdmin),

      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
      stats: skipStats ? null : {
        total: totalLeads,
        notContacted: notContactedLeads,
        pending: pendingLeads,
        live: liveLeads,
        lost: lostLeads,
        callback: callbackLeads,
        open: pendingLeads,
        closedSuccessful: liveLeads,
        closedUnsuccessful: lostLeads,
        categories: categoryStats,
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

