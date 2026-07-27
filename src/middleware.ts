import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-change-me');
const COOKIE_NAME = 'sga-session';

const publicPaths = ['/login', '/api/auth/login', '/api/webhooks'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  
  // Allow Google OAuth callback (needs to work without existing session context)
  if (pathname.startsWith('/api/auth/google')) {
    return NextResponse.next();
  }

  // Allow _next static files and favicon
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }
  
  // Check for session
  const token = request.cookies.get(COOKIE_NAME)?.value;
  
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  try {
    await jwtVerify(token, JWT_SECRET);
    
    // If authenticated user visits login, redirect to dashboard
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    return NextResponse.next();
  } catch {
    // Invalid token
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
