import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

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

    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').toLowerCase();

    const [users, leads] = await Promise.all([
      prisma.user.findMany({
        where: {
          username: {
            notIn: [superUsername, 'sudo'],
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          username: true,
          role: true,
          assignedBranch: true,
          assignedPlatform: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
      prisma.lead.findMany({
        select: {
          id: true,
          branch: true,
          platform: true,
          assignedConsultant: true,
          status: true,
          testDrive: true,
          uploadedById: true,
          uploadedAt: true,
        },
      }),
    ]);

    const activity = users.map((u) => {
      let relevantLeads: typeof leads = [];

      const isGlobalAdmin = (u.role === 'ADMIN' || u.role === 'SUPERADMIN') && !u.assignedBranch && !u.assignedPlatform;

      if (isGlobalAdmin) {
        relevantLeads = leads;
      } else {
        const uNormName = normalize(u.username);
        const uNormBranch = normalize(u.assignedBranch);
        const uNormPlatform = normalize(u.assignedPlatform);

        relevantLeads = leads.filter((l) => {
          const matchConsultant = l.assignedConsultant && normalize(l.assignedConsultant) === uNormName;
          const matchBranch = uNormBranch ? (l.branch && normalize(l.branch).includes(uNormBranch)) : true;
          const matchPlatform = uNormPlatform ? (l.platform && normalize(l.platform) === uNormPlatform) : true;
          const matchUploader = l.uploadedById === u.id;

          if (matchConsultant || matchUploader) return true;
          if (uNormBranch && matchBranch) {
            if (uNormPlatform) return matchPlatform;
            return true;
          }
          return false;
        });
      }

      let notContacted = 0;
      let pending = 0;
      let live = 0;
      let lost = 0;
      let testDriveYes = 0;
      let testDriveNo = 0;

      relevantLeads.forEach((l) => {
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

      return {
        userId: u.id,
        username: u.username,
        role: u.role,
        assignedBranch: u.assignedBranch,
        assignedPlatform: u.assignedPlatform,
        total: relevantLeads.length,
        notContacted,
        pending,
        live,
        lost,
        testDriveYes,
        testDriveNo,
        externalUploaded: userUploadedLeads.length,
        lastUploadAt: lastUpload,
      };
    });

    activity.sort((a, b) => b.total - a.total);

    return NextResponse.json({ activity });
  } catch (error) {
    console.error('User Activity stats error:', error);
    return NextResponse.json({ error: 'Failed to compute activity stats' }, { status: 500 });
  }
}

