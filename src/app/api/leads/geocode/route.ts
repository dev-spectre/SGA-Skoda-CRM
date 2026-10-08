import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { routeLeadToBranch, routeLeadToBranchFast, logRoutingActivity } from '@/lib/location/routing';
import { getActiveBranchesCached } from '@/lib/location/cache';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { leadIds, force = false } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ success: true, updated: [] });
    }

    // Limit batch size to max 1000 leads at a time
    const safeLeadIds = leadIds
      .slice(0, 1000)
      .filter((id): id is number => typeof id === 'number' && id > 0);

    if (safeLeadIds.length === 0) {
      return NextResponse.json({ success: true, updated: [] });
    }

    // 1. Fetch active branches from in-memory cache (< 0.001ms)
    const activeBranches = await getActiveBranchesCached();
    if (activeBranches.length === 0) {
      return NextResponse.json(
        { error: 'No active dealership branches available for auto-assignment' },
        { status: 400 }
      );
    }

    const activeBranchNames = new Set<string>();
    activeBranches.forEach((b) => {
      const lower = b.name.toLowerCase().trim();
      activeBranchNames.add(lower);
      activeBranchNames.add(`sga motors ${lower}`);
      activeBranchNames.add(`sga ${lower}`);
      if (b.code) activeBranchNames.add(b.code.toLowerCase().trim());
    });

    // 2. Fetch requested leads
    const targetLeads = await prisma.lead.findMany({
      where: { id: { in: safeLeadIds } },
      select: {
        id: true,
        city: true,
        branch: true,
        isBranchManual: true,
        isOutOfState: true,
      },
    });

    const updated: { id: number; branch: string; isOutOfState?: boolean }[] = [];

    // 3. Process leads using tiered routing
    for (const lead of targetLeads) {
      if (lead.isBranchManual && !force) {
        continue;
      }

      const currentBranchClean = (lead.branch || '').toLowerCase().trim();
      const hasValidBranch = currentBranchClean && activeBranchNames.has(currentBranchClean);

      if (hasValidBranch && !force) {
        continue;
      }

      const cleanCity = (lead.city || '').trim();
      if (!cleanCity) {
        continue;
      }

      try {
        let routeRes = await routeLeadToBranchFast(cleanCity, {
          candidateBranches: activeBranches,
        });

        if (routeRes.status === 'unresolved' && force) {
          routeRes = await routeLeadToBranch(cleanCity, {
            candidateBranches: activeBranches,
            skipExternalGeocode: false,
          });
        }

        if (routeRes.status === 'assigned' && routeRes.assignedBranch) {
          const targetBranch = routeRes.assignedBranch.name;
          if (targetBranch !== (lead.branch || '') || lead.isOutOfState) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                branch: targetBranch,
                isOutOfState: false,
              },
            });

            logRoutingActivity(lead.id, routeRes, currentUser.username || 'System').catch(
              console.error
            );

            updated.push({ id: lead.id, branch: targetBranch, isOutOfState: false });
          }
        } else if (routeRes.status === 'out_of_state' || routeRes.isOutOfState) {
          if (!lead.isOutOfState || (lead.branch && lead.branch !== '')) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                branch: '',
                isOutOfState: true,
              },
            });

            logRoutingActivity(lead.id, routeRes, currentUser.username || 'System').catch(
              console.error
            );

            updated.push({ id: lead.id, branch: '', isOutOfState: true });
          }
        }
      } catch (leadErr) {
        console.warn(`Routing error for lead ${lead.id}:`, leadErr);
      }
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('Leads geocode batch error:', error);
    return NextResponse.json(
      { error: 'Failed to process branch auto-assignment batch' },
      { status: 500 }
    );
  }
}
