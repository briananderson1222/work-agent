import { resolveApiBase } from '../query-core';

export async function fetchVapidPublicKey(apiBase?: string): Promise<string> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(
    `${resolvedApiBase}/api/system/vapid-public-key`,
  );
  if (!response.ok) {
    throw new Error('Server does not support push notifications');
  }
  const result = (await response.json()) as { publicKey?: string };
  if (!result.publicKey) {
    throw new Error('Missing VAPID public key');
  }
  return result.publicKey;
}

export async function subscribePushNotifications(
  subscription: PushSubscriptionJSON,
  apiBase?: string,
): Promise<void> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  await fetch(`${resolvedApiBase}/api/system/push-subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribePushNotifications(
  endpoint: string,
  apiBase?: string,
): Promise<void> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  await fetch(`${resolvedApiBase}/api/system/push-unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export async function createVoiceSession(apiBase?: string): Promise<{
  sessionId?: string;
}> {
  const resolvedApiBase = await resolveApiBase(apiBase);
  const response = await fetch(`${resolvedApiBase}/api/voice/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(`Session creation failed: ${response.status}`);
  }
  return (await response.json()) as { sessionId?: string };
}
