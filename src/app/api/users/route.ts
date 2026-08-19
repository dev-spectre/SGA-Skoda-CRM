import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { hashPassword } from '@/lib/passwords';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').toLowerCase();

    const users = await prisma.user.findMany({
      where: {
        username: {
          notIn: [superUsername, 'sudo'],
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        assignedBranch: true,
        assignedPlatform: true,
        allowExternalUpload: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, role, assignedBranch, assignedPlatform, allowExternalUpload } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const trimmedUsername = username.trim();
    const superUsername = (process.env.SUPERADMIN_USERNAME || 'sudo').toLowerCase();
    if (trimmedUsername.toLowerCase() === superUsername || trimmedUsername.toLowerCase() === 'sudo') {
      return NextResponse.json({ error: 'This username is reserved and cannot be created.' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const assigned = assignedBranch ? assignedBranch.trim() : null;
    const assignedPlat = assignedPlatform ? assignedPlatform.trim() : null;
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
    const hashedPassword = hashPassword(password.trim());

    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        password: hashedPassword,
        role: userRole,
        assignedBranch: assigned,
        assignedPlatform: assignedPlat,
        allowExternalUpload: Boolean(allowExternalUpload),
      },
      select: {
        id: true,
        username: true,
        role: true,
        assignedBranch: true,
        assignedPlatform: true,
        allowExternalUpload: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

