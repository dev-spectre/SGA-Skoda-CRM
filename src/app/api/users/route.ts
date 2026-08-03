import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { hashPassword } from '@/lib/passwords';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const users: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "username", "role", "assignedBranch", "createdAt", "updatedAt" FROM "User" ORDER BY "createdAt" DESC`
    );

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, role, assignedBranch } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const existingUsers: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "User" WHERE "username" = $1 LIMIT 1`,
      username.trim()
    );

    if (existingUsers.length > 0) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const assigned = assignedBranch ? assignedBranch.trim() : null;
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
    const hashedPassword = hashPassword(password.trim());

    const createdUsers: any[] = await prisma.$queryRawUnsafe(
      `INSERT INTO "User" ("username", "password", "role", "assignedBranch", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING "id", "username", "role", "assignedBranch", "createdAt"`,
      username.trim(),
      hashedPassword,
      userRole,
      assigned
    );

    return NextResponse.json({ user: createdUsers[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
