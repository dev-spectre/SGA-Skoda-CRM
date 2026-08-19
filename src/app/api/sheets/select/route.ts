import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeIntelligentMapping } from '@/lib/mapping';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Administrators can select spreadsheet.' },
        { status: 403 }
      );
    }


    const body = await request.json();
    const { spreadsheetId, spreadsheetName, sheetName } = body;
    
    if (!spreadsheetId || !sheetName) {
      return NextResponse.json(
        { error: 'spreadsheetId and sheetName are required' },
        { status: 400 }
      );
    }
    
    const currentSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (
      currentSettings && 
      (currentSettings.selectedSpreadsheetId !== spreadsheetId || currentSettings.selectedSheetName !== sheetName)
    ) {
      // Clear database cache only for previous sheet's leads, preserving external uploads
      await prisma.lead.deleteMany({
        where: {
          source: { not: 'External Upload' },
          uploadedById: null,
        },
      });
    }
    
    await prisma.settings.upsert({
      where: { id: 1 },
      update: {
        selectedSpreadsheetId: spreadsheetId,
        selectedSpreadsheetName: spreadsheetName || null,
        selectedSheetName: sheetName,
      },
      create: {
        id: 1,
        selectedSpreadsheetId: spreadsheetId,
        selectedSpreadsheetName: spreadsheetName || null,
        selectedSheetName: sheetName,
      },
    });
    
    try {
      const mapping = await computeIntelligentMapping(spreadsheetId, sheetName);
      await prisma.settings.update({
        where: { id: 1 },
        data: { columnMapping: JSON.stringify(mapping) },
      });
    } catch (mappingError) {
      console.error('Auto-mapping failed during sheet select:', mappingError);
      // We still return success since the sheet was selected, but mapping might be incomplete
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Select sheet error:', error);
    return NextResponse.json(
      { error: 'Failed to save sheet selection' },
      { status: 500 }
    );
  }
}
