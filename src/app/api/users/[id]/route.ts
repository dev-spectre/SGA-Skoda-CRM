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
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    const { username, password, role, assignedBranch } = body;

    const existingUsers: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "User" WHERE "id" = $1 LIMIT 1`,
      userId
    );
    if (existingUsers.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentUserObj = existingUsers[0];
    const newUsername = username !== undefined ? username.trim() : currentUserObj.username;
    const newPassword = password !== undefined && password.trim() !== '' 
      ? hashPassword(password.trim()) 
      : currentUserObj.password;
    const newRole = role !== undefined ? (role === 'ADMIN' ? 'ADMIN' : 'USER') : currentUserObj.role;
    const newAssignedBranch = assignedBranch !== undefined ? (assignedBranch ? assignedBranch.trim() : null) : currentUserObj.assignedBranch;

    const updatedUsers: any[] = await prisma.$queryRawUnsafe(
      `UPDATE "User" 
       SET "username" = $1, "password" = $2, "role" = $3, "assignedBranch" = $4, "updatedAt" = CURRENT_TIMESTAMP 
       WHERE "id" = $5 
       RETURNING "id", "username", "role", "assignedBranch", "updatedAt"`,
      newUsername,
      newPassword,
      newRole,
      newAssignedBranch,
      userId
    );

    return NextResponse.json({ user: updatedUsers[0] });
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
    if (!currentUser || currentUser.role !== 'ADMIN') {
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

    await prisma.$executeRawUnsafe(
      `DELETE FROM "User" WHERE "id" = $1`,
      userId
    );

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
