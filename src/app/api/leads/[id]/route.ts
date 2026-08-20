import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAndWriteToSheetRow, findAndDeleteSheetRow } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';
import { logLeadDiff, checkLeadLockForUser, resolveLeadHandler } from '@/lib/activity';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();
    const { status, remark, followUpDate1, followUpDate2, assignedConsultant, testDrive } = body;
    
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const currentUser = await getCurrentUser();

    // Server-level and DB-level lock enforcement:
    // If a normal user is handling this lead, only that user (or admins) can modify it.
    const lockCheck = await checkLeadLockForUser(leadId, currentUser);
    if (lockCheck.isLocked) {
      return NextResponse.json(
        { error: lockCheck.error || 'This lead is locked by another user', handledBy: lockCheck.handledBy },
        { status: 403 }
      );
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    
    if (status !== undefined) {
      if (!['pending', 'live', 'lost', 'created', 'closed_successful', 'closed_unsuccessful', 'not_contacted'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      let targetStatus = status;
      if (status === 'created') targetStatus = 'not_contacted';
      if (status === 'closed_successful') targetStatus = 'live';
      if (status === 'closed_unsuccessful') targetStatus = 'lost';
      updateData.status = targetStatus;
    }
    
    if (remark !== undefined) {
      updateData.remark = remark;
      if (!status && (lead.status === 'created' || lead.status === 'pending' || lead.status === 'not_contacted')) {
        updateData.status = 'live';
      }
    }
    
    if (followUpDate1 !== undefined) {
      updateData.followUpDate1 = followUpDate1 ? new Date(followUpDate1.includes('T') ? followUpDate1 : `${followUpDate1}T12:00:00Z`) : null;
    }
    if (followUpDate2 !== undefined) {
      updateData.followUpDate2 = followUpDate2 ? new Date(followUpDate2.includes('T') ? followUpDate2 : `${followUpDate2}T12:00:00Z`) : null;
    }
    
    if (assignedConsultant !== undefined) {
      updateData.assignedConsultant = assignedConsultant;
    }

    if (testDrive !== undefined) {
      updateData.testDrive = testDrive;
    }
    
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    });

    // Log user activity changes (skips superadmin automatically)
    await logLeadDiff({
      leadId,
      user: currentUser,
      previousLead: lead,
      updates: updateData,
    });
    
    // Wait for Google Sheet update only for primary sheet leads (never write back external uploads)
    if (lead.source !== 'External Upload' && lead.uploadedById === null) {
      try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const spreadsheetId = lead.sheetId || settings?.selectedSpreadsheetId;
        const sheetName = settings?.selectedSheetName;

        if (spreadsheetId && sheetName && settings?.googleAccessToken) {
          const mapping = settings.columnMapping
            ? JSON.parse(settings.columnMapping)
            : { remark: 7, status: 8 };
          
          const updates: { col: number; value: string }[] = [];
          if (remark !== undefined && mapping.remark !== undefined && mapping.remark >= 0) {
            updates.push({ col: mapping.remark, value: remark || '' });
          }
          if (followUpDate1 !== undefined && mapping.followUpDate1 !== undefined && mapping.followUpDate1 >= 0) {
            updates.push({ col: mapping.followUpDate1, value: followUpDate1 || '' });
          }
          if (followUpDate2 !== undefined && mapping.followUpDate2 !== undefined && mapping.followUpDate2 >= 0) {
            updates.push({ col: mapping.followUpDate2, value: followUpDate2 || '' });
          }
          if (assignedConsultant !== undefined && mapping.assignedConsultant !== undefined && mapping.assignedConsultant >= 0) {
            updates.push({ col: mapping.assignedConsultant, value: assignedConsultant || '' });
          }
          if (testDrive !== undefined && mapping.testDrive !== undefined && mapping.testDrive >= 0) {
            updates.push({ col: mapping.testDrive, value: testDrive || '' });
          }
          if (mapping.status !== undefined && mapping.status >= 0) {
            const finalStatus = updateData.status || lead.status;
            updates.push({ col: mapping.status, value: finalStatus });
          }
          if (updates.length > 0) {
            await findAndWriteToSheetRow(spreadsheetId, sheetName, lead, updates);
          }
        }
      } catch (sheetError) {
        console.error('Failed to update Google Sheet row:', sheetError);
      }
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
  } catch (error: any) {
    console.error('Lead update error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to update lead', details: error?.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const searchParams = request.nextUrl.searchParams;
    const deleteFromSheet = searchParams.get('deleteFromSheet') === 'true';

    const currentUser = await getCurrentUser();
    const isSuper = currentUser && (currentUser.isSuperAdmin || currentUser.role === 'SUPERADMIN' || currentUser.username === (process.env.SUPERADMIN_USERNAME || 'sudo'));

    if (!isSuper) {
      return NextResponse.json({ error: 'Unauthorized. Only the Superadmin can delete leads.' }, { status: 403 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Superadmin permanently deletes the lead (only delete from sheet for primary sheet leads)
    if (deleteFromSheet && lead.source !== 'External Upload' && lead.uploadedById === null) {
      try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const spreadsheetId = lead.sheetId || settings?.selectedSpreadsheetId;
        const sheetName = settings?.selectedSheetName;

        if (spreadsheetId && sheetName && settings?.googleAccessToken) {
          await findAndDeleteSheetRow(spreadsheetId, sheetName, lead);
        }
      } catch (sheetError) {
        console.error('Failed to delete Google Sheet row:', sheetError);
      }
    }

    await prisma.lead.delete({ where: { id: leadId } });

    return NextResponse.json({
      success: true,
      deletedId: leadId,
      deletedFromSheet: deleteFromSheet,
      isPermanent: true,
    });
  } catch (error) {
    console.error('Lead delete error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}

