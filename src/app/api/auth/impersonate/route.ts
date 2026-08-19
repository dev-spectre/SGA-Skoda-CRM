import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Superadmin (or an active superadmin session) can impersonate accounts
    const isSuper = currentUser.isSuperAdmin || currentUser.role === 'SUPERADMIN' || currentUser.impersonatingFrom === (process.env.SUPERADMIN_USERNAME || 'sudo') || currentUser.username === (process.env.SUPERADMIN_USERNAME || 'sudo');

    if (!isSuper) {
      return NextResponse.json({ error: 'Forbidden. Superadmin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId, targetUsername } = body;

    let targetUser: any = null;
    if (targetUserId) {
      targetUser = await prisma.user.findUnique({
        where: { id: parseInt(targetUserId, 10) },
      });
    } else if (targetUsername) {
      targetUser = await prisma.user.findUnique({
        where: { username: String(targetUsername).trim() },
      });
    }

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const superUsername = process.env.SUPERADMIN_USERNAME || 'sudo';

    // Create impersonation session with target user permissions, but retaining Superadmin privilege & impersonatingFrom flag
    await createSession({
      userId: targetUser.id,
      username: targetUser.username,
      role: targetUser.role,
      assignedBranch: targetUser.assignedBranch,
      assignedPlatform: targetUser.assignedPlatform,
      allowExternalUpload: targetUser.allowExternalUpload,
      isSuperAdmin: true,
      impersonatingFrom: superUsername,
    });

    return NextResponse.json({
      success: true,
      message: `Now impersonating ${targetUser.username}`,
      user: {
        userId: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
        assignedBranch: targetUser.assignedBranch,
        assignedPlatform: targetUser.assignedPlatform,
        allowExternalUpload: targetUser.allowExternalUpload,
        isSuperAdmin: true,
        impersonatingFrom: superUsername,
      },
    });
  } catch (error: any) {
    console.error('Impersonation error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to impersonate user' }, { status: 500 });
  }
}
