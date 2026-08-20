import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { resolveLeadHandler } from '@/lib/activity';

function normalize(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();

    // 1. Fetch non-superadmin users, leads, and activity records
    const [users, leads, userActivities] = await Promise.all([
      prisma.user.findMany({
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
          allowExternalUpload: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
      prisma.lead.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          branch: true,
          platform: true,
          assignedConsultant: true,
          status: true,
          testDrive: true,
          uploadedById: true,
          uploadedAt: true,
          createdAt: true,
          updatedAt: true,
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

    // Fast lookup structures for staff
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

    // Group activities by lead (chronological order)
    const activitiesByLead = new Map<number, typeof userActivities>();
    const activitiesByUserId = new Map<number, typeof userActivities>();
    const activitiesByUsername = new Map<string, typeof userActivities>();

    for (const act of userActivities) {
      const leadList = activitiesByLead.get(act.leadId) || [];
      leadList.push(act);
      activitiesByLead.set(act.leadId, leadList);

      if (act.userId) {
        const list = activitiesByUserId.get(act.userId) || [];
        list.push(act);
        activitiesByUserId.set(act.userId, list);
      }
      if (act.username) {
        const uKey = act.username.toLowerCase();
        const list = activitiesByUsername.get(uKey) || [];
        list.push(act);
        activitiesByUsername.set(uKey, list);
      }
    }

    // UNIQUE ACTIVE HANDLER RESOLUTION:
    // 1. If lead status is 'not_contacted' / 'created' -> Handled by NO ONE (open for anyone to handle).
    // 2. Once a lead is moved out of 'not_contacted', the first staff member to claim it is the handler.
    // 3. Edits by other users are recorded in the audit log, but do NOT transfer ownership or count for other users.
    // 4. Changing status back to 'not_contacted' un-claims the lead.
    const leadsByHandlerUserId = new Map<number, typeof leads>();

    for (const l of leads) {
      const leadActs = activitiesByLead.get(l.id) || [];
      const handlerName = resolveLeadHandler(l, leadActs, staffUsernames, staffUserById);

      if (handlerName) {
        const handlerStaff = userByName.get(normalize(handlerName));
        if (handlerStaff) {
          const uLeads = leadsByHandlerUserId.get(handlerStaff.id) || [];
          uLeads.push(l);
          leadsByHandlerUserId.set(handlerStaff.id, uLeads);
        }
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let totalChangesToday = 0;
    for (const act of userActivities) {
      if (new Date(act.createdAt) >= todayStart) {
        totalChangesToday++;
      }
    }

    const activity = users.map((u) => {
      // Leads currently handled exclusively by this user
      const uHandledLeads = leadsByHandlerUserId.get(u.id) || [];

      let notContacted = 0;
      let pending = 0;
      let live = 0;
      let lost = 0;
      let testDriveYes = 0;
      let testDriveNo = 0;

      uHandledLeads.forEach((l) => {
        const s = l.status;
        if (s === 'not_contacted' || s === 'created') notContacted++;
        else if (s === 'pending') pending++;
        else if (s === 'live' || s === 'closed_successful') live++;
        else if (s === 'lost' || s === 'closed_unsuccessful') lost++;

        if (l.testDrive === 'Scheduled' || l.testDrive === 'Completed' || l.testDrive === 'Yes') testDriveYes++;
        else testDriveNo++;
      });

      const userUploadedLeads = leads.filter((l) => l.uploadedById === u.id);
      const lastUpload = userUploadedLeads.length > 0
        ? userUploadedLeads.reduce((max, l) => (!max || (l.uploadedAt && new Date(l.uploadedAt) > new Date(max)) ? l.uploadedAt : max), null as Date | null)
        : null;

      // User activities & last active
      const uActs = activitiesByUserId.get(u.id) || activitiesByUsername.get(u.username.toLowerCase()) || [];
      const changesCount = uActs.length;
      const lastActionAt = uActs.length > 0 ? uActs[uActs.length - 1].createdAt : null;

      let lastActiveAt: Date | null = null;
      if (lastActionAt && lastUpload) {
        lastActiveAt = new Date(lastActionAt) > new Date(lastUpload) ? lastActionAt : lastUpload;
      } else {
        lastActiveAt = lastActionAt || lastUpload;
      }

      return {
        userId: u.id,
        username: u.username,
        role: u.role,
        assignedBranch: u.assignedBranch,
        assignedPlatform: u.assignedPlatform,
        allowExternalUpload: u.allowExternalUpload,
        total: uHandledLeads.length,
        notContacted,
        pending,
        live,
        lost,
        testDriveYes,
        testDriveNo,
        externalUploaded: userUploadedLeads.length,
        lastUploadAt: lastUpload,
        changesCount,
        lastActiveAt,
      };
    });

    activity.sort((a, b) => b.total - a.total);

    return NextResponse.json({
      activity,
      summary: {
        totalStaff: users.length,
        totalHandledLeads: leads.filter(l => l.status !== 'not_contacted' && l.status !== 'created').length,
        totalExternalUploads: leads.filter(l => l.uploadedById !== null).length,
        totalActivities: userActivities.length,
        totalChangesToday,
      }
    });
  } catch (error) {
    console.error('User Activity stats error:', error);
    return NextResponse.json({ error: 'Failed to compute activity stats' }, { status: 500 });
  }
}
