import fs from 'fs';
import path from 'path';
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
  assignedPlatform: string | null;
  allowExternalUpload: boolean;
  isSuperAdmin?: boolean;
  impersonatingFrom?: string | null;
}

export async function ensureDefaultAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (!existing) {
    const hashedPassword = hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        role: 'ADMIN',
        assignedBranch: null,
        assignedPlatform: null,
        allowExternalUpload: true,
      },
    });
  } else {
    await prisma.user.update({
      where: { username: adminUsername },
      data: {
        role: 'ADMIN',
        assignedBranch: null,
        assignedPlatform: null,
        allowExternalUpload: true,
      },
    });
  }
}


export function getSuperadminEnv() {

  let envUsername = process.env.SUPERADMIN_USERNAME;
  let envPassword = process.env.SUPERADMIN_PASSWORD;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
        if (key.trim() === 'SUPERADMIN_USERNAME') envUsername = val;
        if (key.trim() === 'SUPERADMIN_PASSWORD') envPassword = val;
      }
    }
  } catch {
    // ignore
  }

  return {
    username: (envUsername || 'sudo').trim(),
    password: (envPassword || 'Sga#Skoda$Sudo_2026!DevSecKey').trim(),
  };
}

export async function verifyCredentials(username: string, password: string): Promise<UserSession | null> {
  const cleanUsername = (username || '').trim();
  const cleanPassword = (password || '').trim();

  const superadmin = getSuperadminEnv();

  // Check env-based Superadmin credentials first (never stored in DB)
  if (cleanUsername.toLowerCase() === superadmin.username.toLowerCase()) {
    if (cleanPassword === superadmin.password || password === superadmin.password) {
      return {
        userId: -1,
        username: superadmin.username,
        role: 'SUPERADMIN',
        assignedBranch: null,
        assignedPlatform: null,
        allowExternalUpload: true,
        isSuperAdmin: true,
        impersonatingFrom: null,
      };
    }
    return null;
  }


  await ensureDefaultAdminUser();

  const user = await prisma.user.findUnique({
    where: { username },
  });

  // Prevent user enumeration by executing constant-time verification path
  if (!user) {
    verifyPassword(password, 'dummy:0000000000000000000000000000000000000000000000000000000000000000');
    return null;
  }

  const isValid = verifyPassword(password, user.password);

  const isAdminUser = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

    if (isValid) {
      return {
        userId: user.id,
        username: user.username,
        role: user.role,
        assignedBranch: user.assignedBranch,
        assignedPlatform: user.assignedPlatform,
        allowExternalUpload: isAdminUser ? true : Boolean(user.allowExternalUpload),
        isSuperAdmin: false,
        impersonatingFrom: null,
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
      assignedPlatform: user.assignedPlatform,
      allowExternalUpload: user.allowExternalUpload,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      impersonatingFrom: user.impersonatingFrom || null,
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
      
      const isSuperAdmin = Boolean(payload.isSuperAdmin);
      const impersonatingFrom = (payload.impersonatingFrom as string) || null;
      const userId = payload.userId as number;

      // Superadmin direct session (env based)
      if (userId === -1 || (isSuperAdmin && !impersonatingFrom)) {
        return {
          userId: -1,
          username: (payload.username as string) || (process.env.SUPERADMIN_USERNAME || 'sudo'),
          role: 'SUPERADMIN',
          assignedBranch: null,
          assignedPlatform: null,
          allowExternalUpload: true,
          isSuperAdmin: true,
          impersonatingFrom: null,
        };
      }

      // Impersonated or DB user
      if (userId && userId > 0) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, role: true, assignedBranch: true, assignedPlatform: true, allowExternalUpload: true },
        });
        if (user) {
          const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN' || isSuperAdmin;
          return {
            userId: user.id,
            username: user.username,
            role: user.role,
            assignedBranch: user.assignedBranch,
            assignedPlatform: user.assignedPlatform,
            allowExternalUpload: isAdmin ? true : Boolean(user.allowExternalUpload),
            isSuperAdmin,
            impersonatingFrom,
          };
        }
      }

      const role = (payload.role as string) || 'ADMIN';
      const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN' || isSuperAdmin;

      return {
        userId: (payload.userId as number) || 1,
        username: (payload.username as string) || 'admin',
        role,
        assignedBranch: (payload.assignedBranch as string) || null,
        assignedPlatform: (payload.assignedPlatform as string) || null,
        allowExternalUpload: isAdmin ? true : ((payload.allowExternalUpload as boolean) || false),
        isSuperAdmin,
        impersonatingFrom,
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

