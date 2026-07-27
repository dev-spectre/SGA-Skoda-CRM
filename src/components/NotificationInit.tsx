"use client";

import { useEffect, useRef } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerWebPushSubscription(customInterval?: number) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  try {
    localStorage.setItem('browser_notifications', 'enabled');
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!subscription && publicVapidKey) {
      const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }

    if (subscription) {
      const storedInterval = localStorage.getItem('device_notification_interval');
      const interval = customInterval ?? (storedInterval ? parseInt(storedInterval) : 5);

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          interval,
          deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser',
        }),
      });
    }

    return subscription;
  } catch (err) {
    console.error('Web Push registration error:', err);
    return null;
  }
}

export async function getWebPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  if (localStorage.getItem('browser_notifications') === 'disabled') {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function unsubscribeWebPush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    localStorage.setItem('browser_notifications', 'disabled');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    }
    return true;
  } catch (err) {
    console.error('Web Push unsubscribe error:', err);
    return false;
  }
}

export function NotificationInit() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Request permission and register Web Push Service Worker
    const requestPermissionAndPush = async () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default' && localStorage.getItem('browser_notifications') !== 'disabled') {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            await registerWebPushSubscription();
          }
        } else if (Notification.permission === 'granted' && localStorage.getItem('browser_notifications') !== 'disabled') {
          await registerWebPushSubscription();
        }
      }
    };
    
    requestPermissionAndPush();

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
