import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parsePhoneNumber } from '@/lib/utils';
import { checkAndNotify } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, city, adname, branch, followUpDate1, followUpDate2, remark } = body;
    
    const parsedName = (name || '').toString().trim();
    const rawPhone = (phone || '').toString().trim();
    const parsedPhone = parsePhoneNumber(rawPhone);
    const parsedEmail = (email || '').toString().trim();
    const parsedCity = (city || '').toString().trim();
    
    if (!parsedName && !parsedPhone && !parsedEmail && !parsedCity) {
      return NextResponse.json(
        { error: 'Lead must contain at least a name, phone, email, or city' },
        { status: 400 }
      );
    }
    
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const sheetId = settings?.selectedSpreadsheetId || 'webhook';

    const nowIso = new Date().toISOString().slice(0, 10);
    const fingerprint = `${parsedPhone}|${nowIso}|0`;

    const existingLead = await prisma.lead.findFirst({
      where: {
        OR: [
          ...(fingerprint ? [{ fingerprint }] : []),
          ...(parsedPhone ? [{ phone: parsedPhone }] : [])
        ]
      }
    });

    if (existingLead) {
      return NextResponse.json({ success: true, lead: existingLead, duplicate: true });
    }
    
    let lead;
    try {
      lead = await prisma.lead.create({
        data: {
          name: parsedName,
          phone: parsedPhone,
          email: parsedEmail,
          city: parsedCity,
          adname: adname ? String(adname).trim() : '',
          branch: branch ? String(branch).trim() : '',
          followUpDate1: followUpDate1 ? new Date(followUpDate1) : null,
          followUpDate2: followUpDate2 ? new Date(followUpDate2) : null,
          remark: remark ? String(remark).trim() : null,
          status: 'pending',
          sheetId,
          fingerprint,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const found = await prisma.lead.findFirst({ where: { fingerprint } });
        return NextResponse.json({ success: true, lead: found, duplicate: true });
      }
      throw err;
    }

    // Trigger notification check immediately
    checkAndNotify().catch(console.error);
    
    return NextResponse.json({ success: true, lead });
  } catch (error) {
    console.error('Lead webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to insert lead via webhook' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Lead Webhook endpoint active. Send POST with lead JSON to insert.' });
}
