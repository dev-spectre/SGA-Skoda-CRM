export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { restartNotificationLoop } = await import('@/lib/notifications');
      await restartNotificationLoop();
    } catch (err) {
      console.error('Failed to initialize background notification loop on server start:', err);
    }
  }
}
