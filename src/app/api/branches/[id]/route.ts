import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, address, latitude, longitude, status } = body;

    const branch = await prisma.branch.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(address && { address }),
        ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
        ...(status && { status }),
      },
    });

    return NextResponse.json({ success: true, branch });
  } catch (error) {
    console.error('Branch update error:', error);
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    await prisma.branch.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Branch deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 });
  }
}
