import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ branches });
  } catch (error) {
    console.error('Branches fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, latitude, longitude, status } = body;

    if (!name || !address) {
      return NextResponse.json({ error: 'Name and address are required' }, { status: 400 });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        address,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        status: status || 'active',
      },
    });

    return NextResponse.json({ success: true, branch });
  } catch (error) {
    console.error('Branch creation error:', error);
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 });
  }
}
