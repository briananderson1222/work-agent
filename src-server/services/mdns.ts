/**
 * mDNS advertisement — publishes the server as _stallion._tcp.local so
 * any mDNS-capable client (Android NsdManager, Avahi, Bonjour, etc.) can
 * discover it without subnet scanning.
 *
 * Set STALLION_MDNS=false to disable.
 */

export function startMdnsAdvertisement(
  name: string,
  port: number,
): () => void {
  if (process.env.STALLION_MDNS === 'false') {
    return () => {};
  }

  // Lazy import so that the module is skipped on environments where
  // bonjour-service is unavailable (e.g. bundled Android server).
  let stopFn: (() => void) | null = null;

  import('bonjour-service')
    .then(({ default: Bonjour }) => {
      const bonjour = new Bonjour();
      const service = bonjour.publish({
        name,
        type: 'stallion',
        protocol: 'tcp',
        port,
      });
      stopFn = () => {
        service.stop?.();
        bonjour.destroy();
      };
    })
    .catch((err) => {
      // bonjour-service is optional; absence is not fatal
      console.warn('[mDNS] advertisement unavailable:', err?.message ?? err);
    });

  return () => {
    stopFn?.();
  };
}
