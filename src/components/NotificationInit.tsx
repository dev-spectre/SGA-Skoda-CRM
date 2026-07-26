"use client";

import { useEffect, useRef } from "react";
import { parsePhoneNumber } from "@/lib/utils";

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

          // Notify dashboard components of updated lead state
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('crm-leads-updated'));
          }

          // Trigger browser notifications if enabled and leads exist
          if (
            data.leads && 
            data.leads.length > 0 && 
            typeof window !== 'undefined' && 
            'Notification' in window &&
            Notification.permission === 'granted' &&
            localStorage.getItem('browser_notifications') !== 'disabled'
          ) {
            if (data.leads.length === 1) {
              const lead = data.leads[0];
              const cleanPhone = parsePhoneNumber(lead.phone);
              new Notification('🚗 SGA Skoda CRM — Open Lead', {
                body: `${lead.name} (${cleanPhone}) from ${lead.city || 'Unknown'}`,
                icon: '/favicon.ico'
              });
            } else {
              new Notification('🚗 SGA Skoda CRM', {
                body: `You have ${data.leads.length} open lead(s) needing attention!`,
                icon: '/favicon.ico'
              });
            }
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
