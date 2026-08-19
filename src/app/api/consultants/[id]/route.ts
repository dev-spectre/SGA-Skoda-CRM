import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }


    const { id } = await params;
    const consultantId = parseInt(id, 10);

    if (isNaN(consultantId)) {
      return NextResponse.json({ error: 'Invalid consultant ID' }, { status: 400 });
    }

    const existing = await prisma.consultant.findUnique({
      where: { id: consultantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });
    }

    await prisma.consultant.delete({
      where: { id: consultantId },
    });

    return NextResponse.json({
      success: true,
      deletedId: consultantId,
      message: `Consultant "${existing.name}" removed successfully`,
    });
  } catch (error: any) {
    console.error('Failed to delete consultant:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete consultant' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }


    const { id } = await params;
    const consultantId = parseInt(id, 10);

    if (isNaN(consultantId)) {
      return NextResponse.json({ error: 'Invalid consultant ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, branch } = body;

    const data: any = {};
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return NextResponse.json({ error: 'Consultant name cannot be empty' }, { status: 400 });
      }
      data.name = trimmedName;
    }

    if (branch !== undefined) {
      const trimmedBranch = String(branch).trim();
      if (!trimmedBranch) {
        return NextResponse.json({ error: 'Branch cannot be empty' }, { status: 400 });
      }
      data.branch = trimmedBranch;
    }

    const existing = await prisma.consultant.findUnique({
      where: { id: consultantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });
    }

    const updated = await prisma.consultant.update({
      where: { id: consultantId },
      data,
    });


    // Cascade name change to assigned leads if name was updated
    if (data.name && data.name !== existing.name) {
      await prisma.lead.updateMany({
        where: { assignedConsultant: existing.name },
        data: { assignedConsultant: data.name },
      });
    }

    return NextResponse.json({ consultant: updated });
  } catch (error: any) {
    console.error('Failed to update consultant:', error);
    return NextResponse.json({ error: error?.message || 'Failed to update consultant' }, { status: 500 });

  }
}
