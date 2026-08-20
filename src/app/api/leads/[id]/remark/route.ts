import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAndWriteToSheetRow } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';
import { logLeadDiff, checkLeadLockForUser, resolveLeadHandler } from '@/lib/activity';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();
    const { remark } = body;
    
    if (remark === undefined) {
      return NextResponse.json({ error: 'Remark is required' }, { status: 400 });
    }
    
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const currentUser = await getCurrentUser();

    // Server-level and DB-level lock enforcement
    const lockCheck = await checkLeadLockForUser(leadId, currentUser);
    if (lockCheck.isLocked) {
      return NextResponse.json(
        { error: lockCheck.error || 'This lead is locked by another user', handledBy: lockCheck.handledBy },
        { status: 403 }
      );
    }
    
    const newStatus = (lead.status === 'created' || lead.status === 'not_contacted') ? 'pending' : lead.status;
    const trimmedRemark = remark.trim();
    
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        remark: trimmedRemark,
        status: newStatus,
      },
    });

    // Log activity diff (skips superadmin automatically)
    await logLeadDiff({
      leadId,
      user: currentUser,
      previousLead: lead,
      updates: {
        remark: trimmedRemark,
        status: newStatus,
      },
    });
    
    // Non-blocking background writeback to Google Sheet (only for primary sheet leads, never external uploads)
    if (lead.source !== 'External Upload' && lead.uploadedById === null) {
      (async () => {
        try {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          const spreadsheetId = lead.sheetId || settings?.selectedSpreadsheetId;
          const sheetName = settings?.selectedSheetName;

          if (spreadsheetId && sheetName && settings?.googleAccessToken) {
            const mapping = settings.columnMapping
              ? JSON.parse(settings.columnMapping)
              : { remark: 7, status: 8 };
            
            const updates: { col: number; value: string }[] = [];
            if (mapping.remark !== undefined) updates.push({ col: mapping.remark, value: trimmedRemark });
            if (mapping.status !== undefined) updates.push({ col: mapping.status, value: newStatus });

            if (updates.length > 0) {
              await findAndWriteToSheetRow(spreadsheetId, sheetName, lead, updates);
            }
          }
        } catch (sheetError) {
          console.error('Failed to update Google Sheet remark in background:', sheetError);
        }
      })();
    }

    // Compute updated handler to return to client
    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
    const [staffUsers, leadActivities] = await Promise.all([
      prisma.user.findMany({
        where: {
          AND: [
            { username: { notIn: [superUsername, 'sudo'], mode: 'insensitive' } },
            { role: { not: 'SUPERADMIN' } },
          ],
        },
        select: { id: true, username: true },
      }),
      prisma.leadActivity.findMany({
        where: {
          leadId,
          username: { notIn: [superUsername, 'sudo'], mode: 'insensitive' },
        },
        orderBy: { createdAt: 'asc' },
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

    const staffUsernames = new Set<string>();
    const staffUserById = new Map<number, string>();
    for (const u of staffUsers) {
      staffUsernames.add(u.username.trim().toLowerCase());
      staffUserById.set(u.id, u.username);
    }

    const currentHandler = resolveLeadHandler(updatedLead, leadActivities, staffUsernames, staffUserById);

    return NextResponse.json({
      lead: {
        ...updatedLead,
        handledBy: currentHandler,
      },
    });
  } catch (error) {
    console.error('Add remark error:', error);
    return NextResponse.json({ error: 'Failed to add remark' }, { status: 500 });
  }
}
