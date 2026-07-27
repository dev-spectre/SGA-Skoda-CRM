import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeIntelligentMapping } from '@/lib/mapping';

export async function POST() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!settings?.selectedSpreadsheetId || !settings?.selectedSheetName) {
      return NextResponse.json({ error: 'No sheet selected' }, { status: 400 });
    }

    const mapping = await computeIntelligentMapping(
      settings.selectedSpreadsheetId,
      settings.selectedSheetName
    );

    await prisma.settings.update({
      where: { id: 1 },
      data: { columnMapping: JSON.stringify(mapping) },
    });

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error('Automap error:', error);
    return NextResponse.json(
      { error: 'Failed to compute column mapping' },
      { status: 500 }
    );
  }
}
