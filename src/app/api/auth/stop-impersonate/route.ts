import { NextResponse } from 'next/server';
import { getCurrentUser, createSession } from '@/lib/auth';

export async function POST() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!currentUser.impersonatingFrom && !currentUser.isSuperAdmin && currentUser.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Not in an impersonation session' }, { status: 400 });
    }

    const superUsername = process.env.SUPERADMIN_USERNAME || 'sudo';

    // Restore direct Superadmin session
    await createSession({
      userId: -1,
      username: superUsername,
      role: 'SUPERADMIN',
      assignedBranch: null,
      assignedPlatform: null,
      allowExternalUpload: true,
      isSuperAdmin: true,
      impersonatingFrom: null,
    });

    return NextResponse.json({
      success: true,
      message: 'Impersonation ended. Restored superadmin session.',
    });
  } catch (error: any) {
    console.error('Stop impersonation error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to stop impersonation' }, { status: 500 });
  }
}
