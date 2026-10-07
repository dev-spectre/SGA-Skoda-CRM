import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

const toISTDateString = (date?: Date | null) => {
  if (!date) return '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN' || Boolean(currentUser?.isSuperAdmin);

    const searchParams = request.nextUrl.searchParams;
    const monthParam = searchParams.get('month') || ''; // YYYY-MM
    const requestedBranch = searchParams.get('branch') || '';
    const branch = !isAdmin && currentUser?.assignedBranch ? currentUser.assignedBranch : requestedBranch;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Soft delete filter: Exclude leads hidden by this user
    if (currentUser?.userId) {
      const hiddenRecords = await prisma.hiddenLead.findMany({
        where: { userId: currentUser.userId },
        select: { leadId: true },
      });
      if (hiddenRecords.length > 0) {
        where.id = { notIn: hiddenRecords.map((r) => r.leadId) };
      }
    }

    if (branch) {
      const branchTokens = branch.split(',').map((b) => b.trim()).filter(Boolean);
      if (branchTokens.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const branchConditions: any[] = branchTokens.map((b) => {
          const words = b.split(/\s+/).filter(Boolean);
          if (words.length > 1) {
            return { AND: words.map((w) => ({ branch: { contains: w, mode: 'insensitive' } })) };
          }
          return { branch: { contains: b, mode: 'insensitive' } };
        });
        where.AND = [...(where.AND || []), { OR: branchConditions }];
      }
    }

    let startDate: Date;
    let endDate: Date;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [yearStr, monthStr] = monthParam.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      // Start of month in IST
      startDate = new Date(`${yearStr}-${monthStr}-01T00:00:00+05:30`);
      // Last day of month
      const lastDay = new Date(year, month, 0).getDate();
      const lastDayStr = String(lastDay).padStart(2, '0');
      endDate = new Date(`${yearStr}-${monthStr}-${lastDayStr}T23:59:59.999+05:30`);
    } else {
      // Default to current month in IST
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
      });
      const parts = formatter.formatToParts(now);
      const y = parts.find((p) => p.type === 'year')?.value || `${now.getFullYear()}`;
      const m = parts.find((p) => p.type === 'month')?.value || `${now.getMonth() + 1}`.padStart(2, '0');
      startDate = new Date(`${y}-${m}-01T00:00:00+05:30`);
      const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      endDate = new Date(`${y}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59.999+05:30`);
    }

    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { followUpDate1: { gte: startDate, lte: endDate } },
          { followUpDate2: { gte: startDate, lte: endDate } },
          { followUps: { some: { date: { gte: startDate, lte: endDate } } } },
        ],
      },
    ];

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        followUpDate1: true,
        followUpDate2: true,
        followUps: {
          where: { date: { gte: startDate, lte: endDate } },
          select: { date: true },
        },
      },
    });

    const counts: Record<string, number> = {};
    const startIso = toISTDateString(startDate);
    const endIso = toISTDateString(endDate);

    for (const lead of leads) {
      const dates = new Set<string>();
      if (Array.isArray(lead.followUps) && lead.followUps.length > 0) {
        for (const fu of lead.followUps) {
          if (fu.date) {
            const d = toISTDateString(fu.date);
            if (d && d >= startIso && d <= endIso) dates.add(d);
          }
        }
      }
      // Also include followUpDate1 and followUpDate2 for backward compat
      if (lead.followUpDate1) {
        const d1 = toISTDateString(lead.followUpDate1);
        if (d1 && d1 >= startIso && d1 <= endIso) dates.add(d1);
      }
      if (lead.followUpDate2) {
        const d2 = toISTDateString(lead.followUpDate2);
        if (d2 && d2 >= startIso && d2 <= endIso) dates.add(d2);
      }
      for (const d of dates) {
        counts[d] = (counts[d] || 0) + 1;
      }
    }

    return NextResponse.json({
      month: monthParam || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
      counts,
    });
  } catch (error) {
    console.error('Calendar counts fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar counts' }, { status: 500 });
  }
}
