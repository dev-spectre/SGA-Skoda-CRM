import { execFile } from 'child_process';
import { prisma } from './prisma';
import { parsePhoneNumber } from './utils';
import { performSheetSync } from './sync';

let notifier: { notify: (options: Record<string, unknown>, callback?: (err: unknown, response: unknown) => void) => void } | null = null;

async function getNotifier() {
  if (!notifier) {
    try {
      const mod = await import('toasted-notifier');
      notifier = mod.default || mod;
    } catch {
      console.warn('toasted-notifier not available, using notify-send fallback');
      return null;
    }
  }
  return notifier;
}

export function sendSystemNotification(title: string, message: string) {
  getNotifier().then((toastedNotifier) => {
    let handled = false;
    if (toastedNotifier) {
      try {
        toastedNotifier.notify({
          title,
          message,
          sound: true,
          wait: false,
        }, (err) => {
          if (err) {
            console.warn('toasted-notifier callback error, attempting notify-send directly:', err);
            fallbackNotifySend(title, message);
          }
        });
        handled = true;
      } catch (err) {
        console.warn('toasted-notifier exception, using notify-send fallback:', err);
      }
    }
    if (!handled) {
      fallbackNotifySend(title, message);
    }
  }).catch(() => {
    fallbackNotifySend(title, message);
  });
}

function fallbackNotifySend(title: string, message: string) {
  execFile('notify-send', [title, message], (err) => {
    if (err) {
      console.error('Failed to send desktop notification via notify-send:', err);
    } else {
      console.log(`🔔 System Desktop Notification Sent: "${title}" - "${message}"`);
    }
  });
}

export async function checkAndNotify() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings && settings.backgroundNotificationsEnabled === false) {
      return { notified: 0, interval: settings.notificationInterval || 5, disabled: true };
    }

    // 1. Perform automatic sheet sync in background to discover new leads
    let newLeadsSynced = 0;
    try {
      const syncResult = await performSheetSync();
      newLeadsSynced = syncResult.synced || 0;
    } catch (syncErr) {
      console.error('Auto background sync warning:', syncErr);
    }

    const intervalMinutes = settings?.notificationInterval || 5;
    const intervalMs = intervalMinutes * 60 * 1000;
    const cutoff = new Date(Date.now() - intervalMs);

    // 2. Find all unclosed leads from DB that haven't been notified within interval
    const unclosedLeads = await prisma.lead.findMany({
      where: {
        status: 'created',
        OR: [
          { notifiedAt: null },
          { notifiedAt: { lt: cutoff } },
        ],
      },
    });

    if (unclosedLeads.length === 0) {
      return { notified: 0, newLeadsSynced, interval: intervalMinutes };
    }

    if (newLeadsSynced > 0) {
      sendSystemNotification(
        '🚗 SGA Skoda CRM — 🆕 New Lead Received!',
        `Synced ${newLeadsSynced} new lead(s) automatically!`
      );
    } else if (unclosedLeads.length === 1) {
      const lead = unclosedLeads[0];
      const cleanPhone = parsePhoneNumber(lead.phone);
      sendSystemNotification(
        '🚗 SGA Skoda CRM — Open Lead',
        `${lead.name} (${cleanPhone}) from ${lead.city || 'Unknown'} — ${lead.platform || 'N/A'}`
      );
    } else {
      sendSystemNotification(
        '🚗 SGA Skoda CRM',
        `You have ${unclosedLeads.length} open lead(s) needing attention!`
      );
    }

    // Update notifiedAt timestamp in DB
    const leadIds = unclosedLeads.map((l) => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: { notifiedAt: new Date() },
    });

    return {
      notified: unclosedLeads.length,
      newLeadsSynced,
      total: unclosedLeads.length,
      leads: unclosedLeads,
      interval: intervalMinutes,
    };
  } catch (error) {
    console.error('Notification check failed:', error);
    return { notified: 0, interval: 5, error: String(error) };
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

// Auto-start background server loop on Node server initialization
if (typeof window === 'undefined') {
  setTimeout(() => {
    restartNotificationLoop().catch(console.error);
  }, 2000);
}
