import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAndWriteToSheetRow, findAndDeleteSheetRow } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';
import { logLeadDiff, checkLeadLockForUser, resolveLeadHandler, getCachedStaffUsers } from '@/lib/activity';
import { getCachedSettings } from '@/lib/settings';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();
    const {
      status,
      remark,
      followUpDate1,
      followUpDate2,
      assignedConsultant,
      testDrive,
      newFollowUpDate,
      updateFollowUp,
      deleteFollowUpStep,
    } = body;
    
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
    if (status !== undefined) updateData.status = status;
    if (remark !== undefined) updateData.remark = remark;
    if (assignedConsultant !== undefined) updateData.assignedConsultant = assignedConsultant;
    if (testDrive !== undefined) updateData.testDrive = testDrive;

    // Follow-up operations handling (Feature 3 & Bug 7)
    let followUpSheetUpdates: { date1?: string | null; date2?: string | null } = {};
    const hasFollowUpOps =
      newFollowUpDate !== undefined ||
      updateFollowUp !== undefined ||
      deleteFollowUpStep !== undefined ||
      followUpDate1 !== undefined ||
      followUpDate2 !== undefined;

    if (hasFollowUpOps) {
      let currentFollowUps = await prisma.leadFollowUp.findMany({
        where: { leadId },
        orderBy: { step: 'asc' },
      });

      // Backward-compatibility seed if LeadFollowUp is empty but Lead has dates
      if (currentFollowUps.length === 0) {
        if (lead.followUpDate1) {
          await prisma.leadFollowUp.create({
            data: { leadId, step: 1, date: lead.followUpDate1 },
          });
        }
        if (lead.followUpDate2) {
          await prisma.leadFollowUp.create({
            data: { leadId, step: 2, date: lead.followUpDate2 },
          });
        }
        currentFollowUps = await prisma.leadFollowUp.findMany({
          where: { leadId },
          orderBy: { step: 'asc' },
        });
      }

      // Check if a step is being cleared or deleted
      const isClearingStep =
        deleteFollowUpStep !== undefined ||
        updateFollowUp?.clear === true ||
        (updateFollowUp && (!updateFollowUp.date || updateFollowUp.date === '')) ||
        (followUpDate1 === null || followUpDate1 === '') ||
        ((followUpDate2 === null || followUpDate2 === '') && followUpDate1 === undefined);

      let stepToDelete: number | null = null;
      if (deleteFollowUpStep !== undefined) {
        stepToDelete = Number(deleteFollowUpStep);
      } else if (updateFollowUp?.clear || (updateFollowUp && (!updateFollowUp.date || updateFollowUp.date === ''))) {
        stepToDelete = Number(updateFollowUp.step);
      } else if (followUpDate1 === null || followUpDate1 === '') {
        stepToDelete = 1;
      } else if (followUpDate2 === null || followUpDate2 === '') {
        stepToDelete = currentFollowUps.length > 1 ? currentFollowUps[currentFollowUps.length - 1].step : 2;
      }

      if (stepToDelete !== null && isClearingStep) {
        // Delete the step from LeadFollowUp
        await prisma.leadFollowUp.deleteMany({
          where: { leadId, step: stepToDelete },
        });

        // Re-index remaining steps sequentially
        const remaining = await prisma.leadFollowUp.findMany({
          where: { leadId },
          orderBy: { step: 'asc' },
        });

        for (let i = 0; i < remaining.length; i++) {
          const targetStep = i + 1;
          if (remaining[i].step !== targetStep) {
            await prisma.leadFollowUp.update({
              where: { id: remaining[i].id },
              data: { step: targetStep },
            });
            remaining[i].step = targetStep;
          }
        }

        const newDate1 = remaining.length > 0 ? remaining[0].date : null;
        const newDate2 = remaining.length > 1 ? remaining[remaining.length - 1].date : null;

        updateData.followUpCount = remaining.length;
        updateData.followUpDate1 = newDate1;
        updateData.followUpDate2 = newDate2;

        followUpSheetUpdates = {
          date1: newDate1 ? newDate1.toISOString().split('T')[0] : '',
          date2: newDate2 ? newDate2.toISOString().split('T')[0] : '',
        };
      } else if (newFollowUpDate) {
        // Adding a new follow-up step
        const rawDate = typeof newFollowUpDate === 'object' ? newFollowUpDate.date : newFollowUpDate;
        const targetStep = (typeof newFollowUpDate === 'object' && newFollowUpDate.step)
          ? Number(newFollowUpDate.step)
          : (body.step ? Number(body.step) : currentFollowUps.length + 1);

        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          await prisma.leadFollowUp.upsert({
            where: { leadId_step: { leadId, step: targetStep } },
            create: { leadId, step: targetStep, date: d },
            update: { date: d },
          });
        }

        const allF = await prisma.leadFollowUp.findMany({
          where: { leadId },
          orderBy: { step: 'asc' },
        });

        const newDate1 = allF.length > 0 ? allF[0].date : null;
        const newDate2 = allF.length > 1 ? allF[allF.length - 1].date : null;

        updateData.followUpCount = allF.length;
        updateData.followUpDate1 = newDate1;
        updateData.followUpDate2 = newDate2;

        followUpSheetUpdates = {
          date1: newDate1 ? newDate1.toISOString().split('T')[0] : '',
          date2: newDate2 ? newDate2.toISOString().split('T')[0] : '',
        };
      } else if (updateFollowUp && updateFollowUp.step && updateFollowUp.date) {
        // Updating an existing step date
        const stepNum = Number(updateFollowUp.step);
        const d = new Date(updateFollowUp.date);
        if (!isNaN(d.getTime())) {
          await prisma.leadFollowUp.upsert({
            where: { leadId_step: { leadId, step: stepNum } },
            create: { leadId, step: stepNum, date: d },
            update: { date: d },
          });
        }

        const allF = await prisma.leadFollowUp.findMany({
          where: { leadId },
          orderBy: { step: 'asc' },
        });

        const newDate1 = allF.length > 0 ? allF[0].date : null;
        const newDate2 = allF.length > 1 ? allF[allF.length - 1].date : null;

        updateData.followUpCount = allF.length;
        updateData.followUpDate1 = newDate1;
        updateData.followUpDate2 = newDate2;

        followUpSheetUpdates = {
          date1: newDate1 ? newDate1.toISOString().split('T')[0] : '',
          date2: newDate2 ? newDate2.toISOString().split('T')[0] : '',
        };
      } else {
        // Standard followUpDate1 / followUpDate2 updates
        if (followUpDate1 !== undefined) {
          const d1 = followUpDate1 ? new Date(followUpDate1) : null;
          updateData.followUpDate1 = d1;
          if (d1) {
            await prisma.leadFollowUp.upsert({
              where: { leadId_step: { leadId, step: 1 } },
              create: { leadId, step: 1, date: d1 },
              update: { date: d1 },
            });
          }
        }
        if (followUpDate2 !== undefined) {
          const d2 = followUpDate2 ? new Date(followUpDate2) : null;
          updateData.followUpDate2 = d2;
          if (d2) {
            const step2 = currentFollowUps.length >= 2 ? currentFollowUps[currentFollowUps.length - 1].step : 2;
            await prisma.leadFollowUp.upsert({
              where: { leadId_step: { leadId, step: step2 } },
              create: { leadId, step: step2, date: d2 },
              update: { date: d2 },
            });
          }
        }
        const allF = await prisma.leadFollowUp.findMany({
          where: { leadId },
          orderBy: { step: 'asc' },
        });
        const newDate1 = allF.length > 0 ? allF[0].date : null;
        const newDate2 = allF.length > 1 ? allF[allF.length - 1].date : null;
        updateData.followUpCount = allF.length;
        updateData.followUpDate1 = newDate1;
        updateData.followUpDate2 = newDate2;
        followUpSheetUpdates = {
          date1: followUpDate1 !== undefined ? (newDate1 ? newDate1.toISOString().split('T')[0] : '') : undefined,
          date2: followUpDate2 !== undefined ? (newDate2 ? newDate2.toISOString().split('T')[0] : '') : undefined,
        };
      }
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    });

    // Log activity diff (skips superadmin automatically)
    await logLeadDiff({
      leadId,
      user: currentUser,
      previousLead: lead,
      updates: updateData,
    });
    
    // Wait for Google Sheet update only for primary sheet leads (never write back external uploads)
    if (lead.source !== 'External Upload' && lead.uploadedById === null) {
      try {
        const settings = await getCachedSettings();
        const spreadsheetId = lead.sheetId || settings?.selectedSpreadsheetId;
        const sheetName = settings?.selectedSheetName;

        if (spreadsheetId && sheetName && settings?.googleAccessToken) {
          const mapping = settings.columnMapping
            ? JSON.parse(settings.columnMapping)
            : { remark: 7, status: 8 };
          
          const updates: { col: number; value: string }[] = [];
          if (remark !== undefined && mapping.remark !== undefined) {
            updates.push({ col: mapping.remark, value: remark });
          }
          if (status !== undefined && mapping.status !== undefined) {
            let formattedStatus = status;
            if (status === 'pending') formattedStatus = 'Contacted';
            else if (status === 'live') formattedStatus = 'Completed';
            else if (status === 'lost') formattedStatus = 'Lost';
            else if (status === 'not_contacted') formattedStatus = 'Not Contacted';
            else if (status === 'callback') formattedStatus = 'Callback';
            updates.push({ col: mapping.status, value: formattedStatus });
          }
          if (followUpSheetUpdates.date1 !== undefined && mapping.followUpDate1 !== undefined) {
            updates.push({ 
              col: mapping.followUpDate1, 
              value: followUpSheetUpdates.date1 || '' 
            });
          } else if (followUpDate1 !== undefined && mapping.followUpDate1 !== undefined) {
            updates.push({ 
              col: mapping.followUpDate1, 
              value: followUpDate1 ? new Date(followUpDate1).toISOString().split('T')[0] : '' 
            });
          }
          if (followUpSheetUpdates.date2 !== undefined && mapping.followUpDate2 !== undefined) {
            updates.push({ 
              col: mapping.followUpDate2, 
              value: followUpSheetUpdates.date2 || '' 
            });
          } else if (followUpDate2 !== undefined && mapping.followUpDate2 !== undefined) {
            updates.push({ 
              col: mapping.followUpDate2, 
              value: followUpDate2 ? new Date(followUpDate2).toISOString().split('T')[0] : '' 
            });
          }
          if (assignedConsultant !== undefined && mapping.assignedConsultant !== undefined) {
            updates.push({ col: mapping.assignedConsultant, value: assignedConsultant || '' });
          }
          if (testDrive !== undefined && mapping.testDrive !== undefined) {
            updates.push({ col: mapping.testDrive, value: testDrive || '' });
          }

          if (updates.length > 0) {
            await findAndWriteToSheetRow(spreadsheetId, sheetName, lead, updates);
          }
        }
      } catch (sheetError) {
        console.error('Failed to update Google Sheet in background:', sheetError);
      }
    }

    // Compute updated handler to return to client
    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').trim().toLowerCase();
    const [{ staffUsernames, staffUserById }, leadActivities, allFollowUps] = await Promise.all([
      getCachedStaffUsers(),
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
      prisma.leadFollowUp.findMany({
        where: { leadId },
        orderBy: { step: 'asc' },
      }),
    ]);

    const currentHandler = resolveLeadHandler(updatedLead, leadActivities, staffUsernames, staffUserById);

    return NextResponse.json({
      lead: {
        ...updatedLead,
        followUps: allFollowUps,
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
        const settings = await getCachedSettings();
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

