import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findAndWriteToSheetRow } from '@/lib/google';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    const body = await request.json();
    const { remark } = body;
    
    if (!remark || remark.trim() === '') {
      return NextResponse.json({ error: 'Remark is required' }, { status: 400 });
    }
    
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    
    const newStatus = (lead.status === 'created' || lead.status === 'pending') ? 'live' : lead.status;
    
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        remark: remark.trim(),
        status: newStatus,
      },
    });
    
    // Non-blocking background writeback to Google Sheet
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
          if (mapping.remark !== undefined) updates.push({ col: mapping.remark, value: remark.trim() });
          if (mapping.status !== undefined) updates.push({ col: mapping.status, value: newStatus });

          if (updates.length > 0) {
            await findAndWriteToSheetRow(spreadsheetId, sheetName, lead, updates);
          }
        }
      } catch (sheetError) {
        console.error('Failed to update Google Sheet remark in background:', sheetError);
      }
    })();
    
    return NextResponse.json({ lead: updatedLead });
  } catch (error) {
    console.error('Add remark error:', error);
    return NextResponse.json({ error: 'Failed to add remark' }, { status: 500 });
  }
}
