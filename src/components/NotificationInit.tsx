"use client";

import { useEffect, useRef } from "react";

export function NotificationInit() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Request permission if not already granted/denied and not explicitly disabled
    const requestPermission = async () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default' && localStorage.getItem('browser_notifications') !== 'disabled') {
          await Notification.requestPermission();
        }
      }
    };
    
    requestPermission();

    const scheduleNextCheck = (delayMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runCheck, delayMs);
    };

    const runCheck = async () => {
      let nextIntervalMs = 60 * 1000; // default 1 min
      try {
        const res = await fetch("/api/notifications/check");
        if (res.ok) {
          const data = await res.json();
          if (data.interval) {
            nextIntervalMs = data.interval * 60 * 1000;
          }

          // Trigger HTML5 Browser Notifications if permission is granted
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            localStorage.getItem('browser_notifications') !== 'disabled'
          ) {
            if (data.newLeadsSynced > 0) {
              new Notification('🚗 SGA Skoda CRM — 🆕 New Lead Received!', {
                body: `Synced ${data.newLeadsSynced} new lead(s) automatically!`,
              });
            } else if (data.notified > 0 && data.leads && data.leads.length > 0) {
              if (data.leads.length === 1) {
                const lead = data.leads[0];
                new Notification('🚗 SGA Skoda CRM — Open Lead', {
                  body: `${lead.name} (${lead.phone}) from ${lead.city || 'Unknown'} — ${lead.platform || 'N/A'}`,
                });
              } else {
                new Notification('🚗 SGA Skoda CRM', {
                  body: `You have ${data.leads.length} open lead(s) needing attention!`,
                });
              }
            }
          }

          // Notify dashboard components of updated lead state
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('crm-leads-updated'));
          }
        }
      } catch (err) {
        console.error('Client notification check error:', err);
      } finally {
        scheduleNextCheck(nextIntervalMs);
      }
    };

    // Listen for settings update event to immediately re-sync notification schedule
    const handleSettingsUpdated = () => {
      runCheck();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('notification-settings-updated', handleSettingsUpdated);
    }

    // Initial check after 2 seconds
    const initialTimeout = setTimeout(runCheck, 2000);

    return () => {
      clearTimeout(initialTimeout);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typeof window !== 'undefined') {
        window.removeEventListener('notification-settings-updated', handleSettingsUpdated);
      }
    };
  }, []);

  return null;
}
