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
      return { notified: 0, interval: settings.notificationInterval || 5, disabled: true };
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

    const intervalMinutes = settings?.notificationInterval || 5;
    const intervalMs = intervalMinutes * 60 * 1000;
    const cutoff = new Date(Date.now() - intervalMs);

    // 2. Find all unclosed leads from DB
    const unclosedLeads = await prisma.lead.findMany({
      where: { status: 'created' },
    });

    if (unclosedLeads.length === 0) {
      return { notified: 0, newLeadsSynced, interval: intervalMinutes };
    }

    // 3. Construct clean notification alert message and await push completion
    if (newLeadsSynced > 0) {
      await sendSystemNotification(
        '🚗 SGA Skoda CRM — 🆕 New Lead Received!',
        `Synced ${newLeadsSynced} new lead(s) automatically!`
      );
    } else if (unclosedLeads.length === 1) {
      const lead = unclosedLeads[0];
      const cleanPhone = parsePhoneNumber(lead.phone);
      await sendSystemNotification(
        '🚗 SGA Skoda CRM — Open Lead',
        `${lead.name} (${cleanPhone}) from ${lead.city || 'Unknown'}`
      );
    } else {
      await sendSystemNotification(
        '🚗 SGA Skoda CRM',
        `You have ${unclosedLeads.length} open lead(s) needing attention!`
      );
    }

    return {
      notified: unclosedLeads.length,
      newLeadsSynced,
      total: unclosedLeads.length,
      leads: unclosedLeads,
      interval: intervalMinutes,
    };
  } catch (error: any) {
    const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error('Notification check failed:', errorMsg);
    return { notified: 0, interval: 5, error: errorMsg };
  }
}

let notificationTimer: ReturnType<typeof setInterval> | null = null;

export function startNotificationLoop(intervalMinutes: number = 5) {
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
  const interval = settings?.notificationInterval || 5;
  startNotificationLoop(interval);
}

// Auto-start background server loop ONLY on traditional long-running Node servers (not Vercel serverless)
if (typeof window === 'undefined' && !process.env.VERCEL) {
  setTimeout(() => {
    restartNotificationLoop().catch(console.error);
  }, 2000);
}
