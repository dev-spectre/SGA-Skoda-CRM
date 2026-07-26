import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/google';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  if (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(
      new URL('/settings?error=google_auth_failed', request.url)
    );
  }
  
  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?error=no_code', request.url)
    );
  }
  
  try {
    await handleCallback(code);
    return NextResponse.redirect(
      new URL('/settings?success=google_linked', request.url)
    );
  } catch (error) {
    console.error('Google callback error:', error);
    return NextResponse.redirect(
      new URL('/settings?error=callback_failed', request.url)
    );
  }
}
