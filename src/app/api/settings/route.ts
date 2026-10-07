import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { restartNotificationLoop } from '@/lib/notifications';
import { getGoogleAccountEmail } from '@/lib/google';
import { getCurrentUser } from '@/lib/auth';
import { getCachedSettings, setCachedSettings } from '@/lib/settings';

export async function GET() {
  try {
    const settings = await getCachedSettings();
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
        notificationInterval: 15,
        backgroundNotificationsEnabled: true,
        columnMapping: null,
        lastSyncAt: null,
      },
      isGoogleLinked: !!settings?.googleAccessToken,
      isSessionExpired: Boolean(!settings?.googleAccessToken && !settings?.googleRefreshToken && googleAccountEmail),
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
    const isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN' || currentUser.isSuperAdmin);
    if (!isAdmin) {
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
      let mappingObj: Record<string, number> = {};
      try {
        mappingObj = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;
      } catch {
        return NextResponse.json({ error: 'Invalid columnMapping JSON format' }, { status: 400 });
      }

      // Safeguard: no two fields can share the same column index, and CRM writeback fields
      // (assignedConsultant, testDrive, remark, status, followUpDate1, followUpDate2)
      // must NEVER collide with read-only source columns (branch, name, phone, city, adname, platform, createdAt).
      const sourceFields = ['branch', 'name', 'phone', 'city', 'adname', 'platform', 'createdAt'] as const;
      const sourceColMap = new Map<number, string>();
      for (const sf of sourceFields) {
        const col = mappingObj[sf];
        if (col !== undefined && col >= 0) {
          sourceColMap.set(col, sf);
        }
      }

      const writebackFields = ['assignedConsultant', 'testDrive', 'remark', 'status', 'followUpDate1', 'followUpDate2'] as const;
      for (const wf of writebackFields) {
        const col = mappingObj[wf];
        if (col !== undefined && col >= 0 && sourceColMap.has(col)) {
          console.warn(`[Settings Guard] Stripped colliding writeback mapping: ${wf} collides with source '${sourceColMap.get(col)}' at col ${col}`);
          delete mappingObj[wf];
        }
      }

      updateData.columnMapping = JSON.stringify(mappingObj);
    }
    
    const settings = await prisma.settings.upsert({
      where: { id: 1 },
      update: updateData,
      create: { id: 1, ...updateData },
    });
    
    setCachedSettings(settings);

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
