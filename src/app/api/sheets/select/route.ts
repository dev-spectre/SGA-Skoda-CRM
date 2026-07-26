import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeIntelligentMapping } from '@/lib/mapping';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId, spreadsheetName, sheetName } = body;
    
    if (!spreadsheetId || !sheetName) {
      return NextResponse.json(
        { error: 'spreadsheetId and sheetName are required' },
        { status: 400 }
      );
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
