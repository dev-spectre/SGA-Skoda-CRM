import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAndWriteToSheetRow, findAndDeleteSheetRow } from '@/lib/google';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();
    const { status, remark } = body;
    
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    
    if (status !== undefined) {
      if (!['created', 'closed_successful', 'closed_unsuccessful'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updateData.status = status;
    }
    
    if (remark !== undefined) {
      updateData.remark = remark;
      if (!status && lead.status === 'created') {
        updateData.status = 'closed_successful';
      }
    }
    
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
    });
    
    // Write back to Google Sheet by dynamically matching lead name and phone
    try {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      const spreadsheetId = lead.sheetId || settings?.selectedSpreadsheetId;
      const sheetName = settings?.selectedSheetName;

      if (spreadsheetId && sheetName && settings?.googleAccessToken) {
        const mapping = settings.columnMapping
          ? JSON.parse(settings.columnMapping)
          : { remark: 7, status: 8 };
        
        const updates: { col: number; value: string }[] = [];
        if (remark !== undefined) updates.push({ col: mapping.remark, value: remark || '' });
        const finalStatus = updateData.status || lead.status;
        updates.push({ col: mapping.status, value: finalStatus });
        
        await findAndWriteToSheetRow(spreadsheetId, sheetName, lead, updates);
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

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

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

    return NextResponse.json({ success: true, deletedId: leadId, deletedFromSheet: deleteFromSheet });
  } catch (error) {
    console.error('Lead delete error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}
