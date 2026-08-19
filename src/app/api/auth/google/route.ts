import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Administrators can link Google Accounts.' },
        { status: 403 }
      );
    }


    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
