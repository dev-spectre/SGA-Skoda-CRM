import { prisma } from './prisma';
import { parsePhoneNumber } from './utils';
import { performSheetSync } from './sync';
import webpush from 'web-push';

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@sgaskoda.com';

if (publicVapidKey && privateVapidKey) {
  try {
    webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
  } catch (e) {
    console.warn('VAPID setup warning:', e);
  }
}

const lastSentPayloads = new Map<string, { body: string; time: number }>();

export async function sendWebPushNotifications(payload: { title: string; body: string; url?: string }) {
  if (!publicVapidKey || !privateVapidKey) {
    return;
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany();
    const now = new Date();

    const pushPromises = subscriptions.map(async (sub) => {
      const intervalMinutes = sub.interval || 5;
      const cutoff = new Date(now.getTime() - intervalMinutes * 60 * 1000);

      // 1. Skip if device was notified within its interval window
      if (sub.lastNotifiedAt && sub.lastNotifiedAt > cutoff) {
        return;
      }

      // 2. Skip if exact same notification message was sent to this device within its interval window
      const lastPayload = lastSentPayloads.get(sub.endpoint);
      if (lastPayload && lastPayload.body === payload.body && lastPayload.time > cutoff.getTime()) {
        return;
      }

      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: JSON.parse(sub.keys),
        };

        // Await Web Push delivery
        await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
        
        // Record successful dispatch in DB and memory
        lastSentPayloads.set(sub.endpoint, { body: payload.body, time: now.getTime() });
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastNotifiedAt: now },
        });
      } catch (err: any) {
        console.error(`Web Push delivery failed to ${sub.endpoint}:`, err?.message || err);
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    });

    await Promise.allSettled(pushPromises);
  } catch (err) {
    console.error('Error dispatching Web Push notifications:', err);
  }
}

export async function sendSystemNotification(title: string, message: string) {
  // Dispatch Web Push exclusively to all registered devices/browsers
  await sendWebPushNotifications({ title, body: message });
}

export async function checkAndNotify() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings && settings.backgroundNotificationsEnabled === false) {
      return { notified: 0, interval: settings.notificationInterval || 15, disabled: true };
    }

    // 1. Perform automatic sheet sync in background (with 5s max timeout to prevent HTTP timeout)
    let newLeadsSynced = 0;
    try {
      const syncTimeout = new Promise((resolve) => setTimeout(() => resolve({ synced: 0, timeout: true }), 5000));
      const syncResult: any = await Promise.race([performSheetSync(), syncTimeout]);
      newLeadsSynced = syncResult?.synced || 0;
    } catch (syncErr) {
      console.error('Auto background sync warning:', syncErr);
    }

    const intervalMinutes = settings?.notificationInterval || 15;
    
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 2. Query counts and single lead details efficiently
    const followUpWhere = {
      status: { notIn: ['closed', 'sold', 'lost', 'completed', 'live', 'closed_successful', 'closed_unsuccessful'] },
      OR: [
        { followUpDate1: { lte: endOfToday } },
        { followUpDate2: { lte: endOfToday } },
      ],
    };
    const unclosedWhere = { status: { in: ['not_contacted', 'pending', 'created'] } };

    const [pendingFollowUpsCount, firstPendingLead, unclosedCount, firstUnclosedLead] = await Promise.all([
      prisma.lead.count({ where: followUpWhere }),
      prisma.lead.findFirst({
        where: followUpWhere,
        orderBy: { createdAt: 'desc' },
        select: { name: true, phone: true, city: true },
      }),
      prisma.lead.count({ where: unclosedWhere }),
      prisma.lead.findFirst({
        where: unclosedWhere,
        select: { name: true, phone: true, city: true },
      }),
    ]);

    if (unclosedCount === 0 && pendingFollowUpsCount === 0 && newLeadsSynced === 0) {
      return { notified: 0, newLeadsSynced, interval: intervalMinutes };
    }

    // 3. Construct clean notification alert message and await push completion
    if (newLeadsSynced > 0) {
      await sendSystemNotification(
        '🚗 SGA Skoda CRM — 🆕 New Lead Received!',
        `Synced ${newLeadsSynced} new lead(s) automatically!`
      );
    } else if (pendingFollowUpsCount > 0) {
      if (pendingFollowUpsCount === 1 && firstPendingLead) {
        const cleanPhone = parsePhoneNumber(firstPendingLead.phone);
        await sendSystemNotification(
          '📅 SGA Skoda CRM — Follow-up Due!',
          `Follow-up due for ${firstPendingLead.name} (${cleanPhone}) from ${firstPendingLead.city || 'Unknown'}`
        );
      } else {
        await sendSystemNotification(
          `📅 SGA Skoda CRM — ${pendingFollowUpsCount} Follow-ups Due!`,
          `You have ${pendingFollowUpsCount} pending follow-up(s) due today needing action!`
        );
      }
    } else if (unclosedCount === 1 && firstUnclosedLead) {
      const cleanPhone = parsePhoneNumber(firstUnclosedLead.phone);
      await sendSystemNotification(
        '🚗 SGA Skoda CRM — Open Lead',
        `${firstUnclosedLead.name} (${cleanPhone}) from ${firstUnclosedLead.city || 'Unknown'}`
      );
    } else {
      await sendSystemNotification(
        '🚗 SGA Skoda CRM',
        `You have ${unclosedCount} open lead(s) needing attention!`
      );
    }

    return {
      notified: unclosedCount + pendingFollowUpsCount,
      pendingFollowUpsCount,
      newLeadsSynced,
      total: unclosedCount,
      interval: intervalMinutes,
    };
  } catch (error: any) {
    const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error('Notification check failed:', errorMsg);
    return { notified: 0, interval: 15, error: errorMsg };
  }
}

let notificationTimer: ReturnType<typeof setInterval> | null = null;

export function startNotificationLoop(intervalMinutes: number = 15) {
  stopNotificationLoop();
  const intervalMs = intervalMinutes * 60 * 1000;
  checkAndNotify().catch(console.error);
  
  notificationTimer = setInterval(() => {
    checkAndNotify().catch(console.error);
  }, intervalMs);
  
  console.log(`🔔 Notification loop started (every ${intervalMinutes} minutes)`);
}

export function stopNotificationLoop() {
  if (notificationTimer) {
    clearInterval(notificationTimer);
    notificationTimer = null;
    console.log('🔕 Notification loop stopped');
  }
}

export async function restartNotificationLoop() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings && settings.backgroundNotificationsEnabled === false) {
    stopNotificationLoop();
    return;
  }
  const interval = settings?.notificationInterval || 15;
  startNotificationLoop(interval);
}

let isGradualDispatching = false;

export async function processGradualNotifications() {
  if (isGradualDispatching) {
    console.log('⏳ Notification dispatch already in progress, skipping duplicate cron trigger.');
    return;
  }

  isGradualDispatching = true;
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings && settings.backgroundNotificationsEnabled === false) {
      console.log('🔕 Background notifications disabled in settings.');
      return;
    }

    // 1. Sync sheet data in background
    let newLeadsSynced = 0;
    try {
      const syncResult = await performSheetSync();
      newLeadsSynced = syncResult?.synced || 0;
    } catch (syncErr) {
      console.error('Background sync error during gradual notification:', syncErr);
    }

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 2. Query counts and single lead details efficiently
    const followUpWhere = {
      status: { notIn: ['closed', 'sold', 'lost', 'completed', 'live', 'closed_successful', 'closed_unsuccessful'] },
      OR: [
        { followUpDate1: { lte: endOfToday } },
        { followUpDate2: { lte: endOfToday } },
      ],
    };
    const unclosedWhere = { status: { in: ['not_contacted', 'pending', 'created'] } };

    const [pendingFollowUpsCount, firstPendingLead, unclosedCount, firstUnclosedLead] = await Promise.all([
      prisma.lead.count({ where: followUpWhere }),
      prisma.lead.findFirst({
        where: followUpWhere,
        orderBy: { createdAt: 'desc' },
        select: { name: true, phone: true, city: true },
      }),
      prisma.lead.count({ where: unclosedWhere }),
      prisma.lead.findFirst({
        where: unclosedWhere,
        select: { name: true, phone: true, city: true },
      }),
    ]);

    if (unclosedCount === 0 && pendingFollowUpsCount === 0 && newLeadsSynced === 0) {
      return;
    }

    // 3. Construct notification content
    let title = '🚗 SGA Skoda CRM';
    let body = `${unclosedCount} open lead(s) needing attention!`;
    if (newLeadsSynced > 0) {
      title = '🚗 SGA Skoda CRM — 🆕 New Lead Received!';
      body = `Synced ${newLeadsSynced} new lead(s) automatically!`;
    } else if (pendingFollowUpsCount > 0) {
      if (pendingFollowUpsCount === 1 && firstPendingLead) {
        const cleanPhone = parsePhoneNumber(firstPendingLead.phone);
        title = '📅 SGA Skoda CRM — Follow-up Due!';
        body = `Follow-up due for ${firstPendingLead.name} (${cleanPhone}) from ${firstPendingLead.city || 'Unknown'}`;
      } else {
        title = `📅 SGA Skoda CRM — ${pendingFollowUpsCount} Follow-ups Due!`;
        body = `You have ${pendingFollowUpsCount} pending follow-up(s) due today needing action!`;
      }
    } else if (unclosedCount === 1 && firstUnclosedLead) {
      const cleanPhone = parsePhoneNumber(firstUnclosedLead.phone);
      title = '🚗 SGA Skoda CRM — Open Lead';
      body = `${firstUnclosedLead.name} (${cleanPhone}) from ${firstUnclosedLead.city || 'Unknown'}`;
    }

    // 4. Send Web Push GRADUALLY across subscriptions with delay
    const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicVapidKey || !privateVapidKey) {
      return;
    }

    const subscriptions = await prisma.pushSubscription.findMany();
    if (subscriptions.length === 0) {
      return;
    }

    const now = new Date();
    for (const sub of subscriptions) {
      const intervalMinutes = sub.interval || 5;
      const cutoff = new Date(now.getTime() - intervalMinutes * 60 * 1000);

      if (sub.lastNotifiedAt && sub.lastNotifiedAt > cutoff) {
        continue;
      }

      const lastPayload = lastSentPayloads.get(sub.endpoint);
      if (lastPayload && lastPayload.body === body && lastPayload.time > cutoff.getTime()) {
        continue;
      }

      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: JSON.parse(sub.keys),
        };
        await webpush.sendNotification(pushSubscription, JSON.stringify({ title, body }));
        lastSentPayloads.set(sub.endpoint, { body, time: now.getTime() });
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastNotifiedAt: now },
        });
      } catch (err: any) {
        console.error(`Gradual Web Push error for ${sub.endpoint}:`, err?.message || err);
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }

      // Gradual delay between each push notification (300ms)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch (err) {
    console.error('Error during gradual notification dispatch:', err);
  } finally {
    isGradualDispatching = false;
  }
}

// Background server loop is initialized cleanly via instrumentation.ts

