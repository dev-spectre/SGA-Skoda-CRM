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
      console.warn('toasted-notifier not available, notifications disabled');
      return null;
    }
  }
  return notifier;
}

export async function checkAndNotify() {
  try {
    // 1. Perform automatic sheet sync in background to discover new leads
    let newLeadsSynced = 0;
    try {
      const syncResult = await performSheetSync();
      newLeadsSynced = syncResult.synced || 0;
    } catch (syncErr) {
      console.error('Auto background sync warning:', syncErr);
    }

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
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

    const toastedNotifier = await getNotifier();
    if (toastedNotifier) {
      if (newLeadsSynced > 0) {
        toastedNotifier.notify({
          title: '🚗 SGA Skoda CRM — 🆕 New Lead Received!',
          message: `Synced ${newLeadsSynced} new lead(s) automatically!`,
          sound: true,
          wait: false,
        });
      } else if (unclosedLeads.length === 1) {
        const lead = unclosedLeads[0];
        const cleanPhone = parsePhoneNumber(lead.phone);
        toastedNotifier.notify({
          title: '🚗 SGA Skoda CRM — Open Lead',
          message: `${lead.name} (${cleanPhone}) from ${lead.city || 'Unknown'} — ${lead.platform || 'N/A'}`,
          sound: true,
          wait: false,
        });
      } else {
        toastedNotifier.notify({
          title: '🚗 SGA Skoda CRM',
          message: `You have ${unclosedLeads.length} open lead(s) needing attention!`,
          sound: true,
          wait: false,
        });
      }
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
  const interval = settings?.notificationInterval || 5;
  startNotificationLoop(interval);
}
