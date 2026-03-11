/**
 * Stallion Service Worker — handles Web Push notifications.
 *
 * Supports two payload shapes:
 *
 * Tool-approval (legacy):
 * { title, body, approvalId, sessionId, agentSlug, apiBase }
 *
 * Generic notification:
 * { title, body, category, notificationId, actions?, apiBase }
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    return;
  }

  const {
    title = 'Stallion',
    body = '',
    category = 'general',
    approvalId,
    notificationId,
    agentSlug,
    apiBase = '',
    actions: customActions,
  } = data;

  // Determine notification tag and actions based on payload type
  const isApproval = !!approvalId;
  const tag = isApproval ? `approval-${approvalId}` : `notification-${notificationId || Date.now()}`;
  const actions = isApproval
    ? [{ action: 'allow', title: 'Allow' }, { action: 'deny', title: 'Deny' }]
    : (customActions || []).map((a) => ({ action: a.id, title: a.label }));

  const showPromise = self.registration.showNotification(title, {
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag,
    requireInteraction: isApproval || category === 'urgent',
    data: { approvalId, notificationId, agentSlug, apiBase, category },
    actions,
  });

  event.waitUntil(showPromise);
});

self.addEventListener('notificationclick', (event) => {
  const { action } = event;
  const { approvalId, notificationId, agentSlug, apiBase, category } = event.notification.data || {};

  event.notification.close();

  // Tool-approval actions
  if (approvalId && (action === 'allow' || action === 'deny')) {
    event.waitUntil(
      fetch(`${apiBase}/api/tools/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, agentSlug, action }),
      }).catch(() => {})
    );
    return;
  }

  // Generic notification actions
  if (notificationId && action) {
    event.waitUntil(
      fetch(`${apiBase}/notifications/${notificationId}/action/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {})
    );
    return;
  }

  // Default tap — focus or open the app
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.focus);
        if (existing) return existing.focus();
        return self.clients.openWindow('/');
      })
  );
});
