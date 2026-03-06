/**
 * Stallion Service Worker — handles Web Push notifications for tool approvals.
 *
 * Push payload shape (JSON):
 * {
 *   title: string,
 *   body: string,
 *   approvalId: string,
 *   sessionId: string,
 *   agentSlug: string,
 *   apiBase: string,
 * }
 *
 * Notification actions:
 *   - 'allow'  → POST /api/tools/approve with { action: 'allow' }
 *   - 'deny'   → POST /api/tools/approve with { action: 'deny' }
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Malformed push — ignore
    return;
  }

  const {
    title = 'Tool Approval Required',
    body = 'An agent is waiting for your approval.',
    approvalId,
    agentSlug,
    apiBase = '',
  } = data;

  const showPromise = self.registration.showNotification(title, {
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: `approval-${approvalId}`,
    requireInteraction: true,
    data: { approvalId, agentSlug, apiBase },
    actions: [
      { action: 'allow', title: 'Allow' },
      { action: 'deny', title: 'Deny' },
    ],
  });

  event.waitUntil(showPromise);
});

self.addEventListener('notificationclick', (event) => {
  const { action } = event;
  const { approvalId, agentSlug, apiBase } = event.notification.data || {};

  event.notification.close();

  if (!approvalId) return;

  if (action === 'allow' || action === 'deny') {
    // Approve/deny in background without opening app
    const respondPromise = fetch(`${apiBase}/api/tools/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approvalId,
        agentSlug,
        action: action === 'allow' ? 'allow' : 'deny',
      }),
    }).catch(() => {
      /* best-effort */
    });

    event.waitUntil(respondPromise);
  } else {
    // Default tap — focus or open the app
    const focusPromise = self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.focus);
        if (existing) return existing.focus();
        return self.clients.openWindow('/');
      });
    event.waitUntil(focusPromise);
  }
});
