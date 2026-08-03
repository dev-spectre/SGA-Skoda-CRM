import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/passwords';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-change-me');
const COOKIE_NAME = 'sga-session';

export interface UserSession {
  userId: number;
  username: string;
  role: string;
  assignedBranch: string | null;
}

export async function ensureDefaultAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existing: any[] = await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "User" WHERE "username" = $1 LIMIT 1`,
    adminUsername
  );

  if (existing.length === 0) {
    const hashedPassword = hashPassword(adminPassword);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("username", "password", "role", "assignedBranch") VALUES ($1, $2, 'ADMIN', NULL)`,
      adminUsername,
      hashedPassword
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "role" = 'ADMIN', "assignedBranch" = NULL WHERE "username" = $1`,
      adminUsername
    );
  }
}

export async function verifyCredentials(username: string, password: string): Promise<UserSession | null> {
  await ensureDefaultAdminUser();

  const users: any[] = await prisma.$queryRawUnsafe(
    `SELECT "id", "username", "password", "role", "assignedBranch" FROM "User" WHERE "username" = $1 LIMIT 1`,
    username
  );

  const user = users[0];

  // Prevent user enumeration by executing constant-time verification path
  if (!user) {
    verifyPassword(password, 'dummy:0000000000000000000000000000000000000000000000000000000000000000');
    return null;
  }

  const isValid = verifyPassword(password, user.password);

  if (isValid) {
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      assignedBranch: user.assignedBranch,
    };
  }

  return null;
}

export async function createSession(user: UserSession): Promise<string> {
  const token = await new SignJWT({
    userId: user.userId,
    username: user.username,
    role: user.role,
    assignedBranch: user.assignedBranch,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
  
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  
  return token;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    
    if (!token) return null;
    
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    const userId = payload.userId as number;
    if (userId) {
      const users: any[] = await prisma.$queryRawUnsafe(
        `SELECT "id", "username", "role", "assignedBranch" FROM "User" WHERE "id" = $1 LIMIT 1`,
        userId
      );
      const user = users[0];
      if (user) {
        return {
          userId: user.id,
          username: user.username,
          role: user.role,
          assignedBranch: user.assignedBranch,
        };
      }
    }

    return {
      userId: (payload.userId as number) || 1,
      username: (payload.username as string) || 'admin',
      role: (payload.role as string) || 'ADMIN',
      assignedBranch: (payload.assignedBranch as string) || null,
    };
  } catch {
    return null;
  }
}

export async function verifySession(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
