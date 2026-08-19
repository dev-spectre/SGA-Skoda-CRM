import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { hashPassword } from '@/lib/passwords';

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
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    const { username, password, role, assignedBranch, assignedPlatform, allowExternalUpload } = body;

    const currentUserObj = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!currentUserObj) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }


    const newUsername = username !== undefined ? username.trim() : currentUserObj.username;
    const newPassword = password !== undefined && password.trim() !== '' 
      ? hashPassword(password.trim()) 
      : currentUserObj.password;
    const newRole = role !== undefined ? (role === 'ADMIN' ? 'ADMIN' : 'USER') : currentUserObj.role;
    const newAssignedBranch = assignedBranch !== undefined ? (assignedBranch ? assignedBranch.trim() : null) : currentUserObj.assignedBranch;
    const newAssignedPlatform = assignedPlatform !== undefined ? (assignedPlatform ? assignedPlatform.trim() : null) : currentUserObj.assignedPlatform;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username: newUsername,
        password: newPassword,
        role: newRole,
        assignedBranch: newAssignedBranch,
        assignedPlatform: newAssignedPlatform,
        allowExternalUpload: allowExternalUpload !== undefined ? Boolean(allowExternalUpload) : currentUserObj.allowExternalUpload,
      },
      select: {
        id: true,
        username: true,
        role: true,
        assignedBranch: true,
        assignedPlatform: true,
        allowExternalUpload: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

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
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    if (currentUser.userId === userId) {
      return NextResponse.json({ error: 'Cannot delete your own admin account' }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
