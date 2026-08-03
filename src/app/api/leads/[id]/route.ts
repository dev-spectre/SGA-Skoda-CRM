import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAndWriteToSheetRow, findAndDeleteSheetRow } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();
    const { status, remark, followUpDate1, followUpDate2 } = body;
    
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    
    if (status !== undefined) {
      if (!['pending', 'live', 'lost', 'created', 'closed_successful', 'closed_unsuccessful'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      let targetStatus = status;
      if (status === 'created') targetStatus = 'pending';
      if (status === 'closed_successful') targetStatus = 'live';
      if (status === 'closed_unsuccessful') targetStatus = 'lost';
      updateData.status = targetStatus;
    }
    
    if (remark !== undefined) {
      updateData.remark = remark;
      if (!status && (lead.status === 'created' || lead.status === 'pending')) {
        updateData.status = 'live';
      }
    }
    
    if (followUpDate1 !== undefined) {
      updateData.followUpDate1 = followUpDate1 ? new Date(followUpDate1.includes('T') ? followUpDate1 : `${followUpDate1}T12:00:00Z`) : null;
    }
    if (followUpDate2 !== undefined) {
      updateData.followUpDate2 = followUpDate2 ? new Date(followUpDate2.includes('T') ? followUpDate2 : `${followUpDate2}T12:00:00Z`) : null;
    }
    
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    });
    
    // Wait for Google Sheet update to ensure it completes in serverless environments
    try {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      const spreadsheetId = lead.sheetId || settings?.selectedSpreadsheetId;
      const sheetName = settings?.selectedSheetName;

      if (spreadsheetId && sheetName && settings?.googleAccessToken) {
        const mapping = settings.columnMapping
          ? JSON.parse(settings.columnMapping)
          : { remark: 7, status: 8 };
        
        const updates: { col: number; value: string }[] = [];
        if (remark !== undefined && mapping.remark !== undefined) {
          updates.push({ col: mapping.remark, value: remark || '' });
        }
        if (followUpDate1 !== undefined && mapping.followUpDate1 !== undefined) {
          updates.push({ col: mapping.followUpDate1, value: followUpDate1 || '' });
        }
        if (followUpDate2 !== undefined && mapping.followUpDate2 !== undefined) {
          updates.push({ col: mapping.followUpDate2, value: followUpDate2 || '' });
        }
        if (mapping.status !== undefined) {
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

    return NextResponse.json({ lead: updatedLead });
  } catch (error) {
    console.error('Lead update error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
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
    const isUser = currentUser && currentUser.role !== 'ADMIN';

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (isUser) {
      // Non-admin user soft-deletes (hides) the lead from their personal view
      await prisma.$executeRawUnsafe(
        `INSERT INTO "HiddenLead" ("userId", "leadId") VALUES ($1, $2) ON CONFLICT ("userId", "leadId") DO NOTHING`,
        currentUser.userId,
        leadId
      );

      return NextResponse.json({
        success: true,
        hiddenId: leadId,
        isHidden: true,
        isPermanent: false,
        message: 'Lead hidden from your view',
      });
    }

    // Admin user permanently deletes the lead
    if (deleteFromSheet) {
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
