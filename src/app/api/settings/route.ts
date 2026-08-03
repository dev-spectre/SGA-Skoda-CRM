import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { restartNotificationLoop } from '@/lib/notifications';
import { getGoogleAccountEmail } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    let googleAccountEmail = settings?.googleAccountEmail || null;

    if (settings?.googleAccessToken && !googleAccountEmail) {
      googleAccountEmail = await getGoogleAccountEmail();
    }
    
    return NextResponse.json({
      settings: settings || {
        id: 1,
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        googleAccountEmail: null,
        selectedSpreadsheetId: null,
        selectedSpreadsheetName: null,
        selectedSheetName: null,
        notificationInterval: 5,
        backgroundNotificationsEnabled: true,
        columnMapping: null,
        lastSyncAt: null,
      },
      isGoogleLinked: !!settings?.googleAccessToken,
      googleAccountEmail,
      hasSheetSelected: !!settings?.selectedSpreadsheetId && !!settings?.selectedSheetName,
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized. Only Administrators can change system settings.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notificationInterval, columnMapping, backgroundNotificationsEnabled } = body;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    
    if (notificationInterval !== undefined) {
      const interval = parseInt(notificationInterval);
      if (isNaN(interval) || interval < 1 || interval > 1440) {
        return NextResponse.json(
          { error: 'Notification interval must be between 1 and 1440 minutes' },
          { status: 400 }
        );
      }
      updateData.notificationInterval = interval;
    }

    if (backgroundNotificationsEnabled !== undefined) {
      updateData.backgroundNotificationsEnabled = Boolean(backgroundNotificationsEnabled);
    }
    
    if (columnMapping !== undefined) {
      updateData.columnMapping = typeof columnMapping === 'string' 
        ? columnMapping 
        : JSON.stringify(columnMapping);
    }
    
    const settings = await prisma.settings.upsert({
      where: { id: 1 },
      update: updateData,
      create: { id: 1, ...updateData },
    });
    
    // Restart notification loop if interval or background notification settings changed
    if (notificationInterval !== undefined || backgroundNotificationsEnabled !== undefined) {
      restartNotificationLoop().catch(console.error);
    }
    
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
