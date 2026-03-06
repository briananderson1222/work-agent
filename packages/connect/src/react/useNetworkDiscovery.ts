import { useCallback, useRef, useState } from 'react';
import type { DiscoveredServer, NativeDiscoverFn } from '../core/types';

export interface UseNetworkDiscoveryOptions {
  /** Port to probe on each host (default: 3141) */
  port?: number;
  /** Path that returns the discovery beacon (default: /api/system/discover) */
  discoveryPath?: string;
  /** Per-probe timeout in ms (default: 500) */
  timeout?: number;
  /** Number of parallel probes (default: 30) */
  batchSize?: number;
  /**
   * Native mDNS discovery (Tauri Android / NsdManager).
   * When provided, results are merged with the subnet scan (or replace it when
   * mdnsEnabled is true and the caller chooses to skip the subnet scan).
   */
  nativeDiscover?: NativeDiscoverFn;
  /**
   * When true and nativeDiscover is provided, native results are surfaced first
   * and the subnet scan is skipped entirely (default: false).
   */
  nativeOnly?: boolean;
}

export interface UseNetworkDiscoveryResult {
  scanning: boolean;
  discovered: DiscoveredServer[];
  scan: () => void;
}

export function useNetworkDiscovery({
  port = 3141,
  discoveryPath = '/api/system/discover',
  timeout = 500,
  batchSize = 30,
  nativeDiscover,
  nativeOnly = false,
}: UseNetworkDiscoveryOptions = {}): UseNetworkDiscoveryResult {
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const scan = useCallback(async () => {
    // Cancel any in-flight scan
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setScanning(true);
    setDiscovered([]);

    try {
      // Native mDNS path — run first, or exclusively when nativeOnly is set
      if (nativeDiscover) {
        const native = await nativeDiscover().catch(
          () => [] as DiscoveredServer[],
        );
        if (ac.signal.aborted) return;
        if (native.length > 0) {
          setDiscovered((prev) => dedup([...prev, ...native]));
        }
        if (nativeOnly) return;
      }

      const subnets = await detectSubnets();
      if (ac.signal.aborted) return;

      for (const subnet of subnets) {
        // Build the 254 candidate IPs for this /24
        const candidates = Array.from(
          { length: 254 },
          (_, i) => `${subnet}${i + 1}`,
        );

        // Probe in batches so we don't open 254 connections simultaneously
        for (let i = 0; i < candidates.length; i += batchSize) {
          if (ac.signal.aborted) break;
          const batch = candidates.slice(i, i + batchSize);
          const hits = await Promise.all(
            batch.map((ip) =>
              probeHost(ip, port, discoveryPath, timeout, ac.signal),
            ),
          );
          const found = hits.filter((h): h is DiscoveredServer => h !== null);
          if (found.length > 0) {
            // Surface discoveries incrementally, merged with any native results
            setDiscovered((prev) => dedup([...prev, ...found]));
          }
        }
      }
    } finally {
      if (!ac.signal.aborted) setScanning(false);
    }
  }, [port, discoveryPath, timeout, batchSize, nativeDiscover, nativeOnly]);

  return { scanning, discovered, scan };
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function probeHost(
  ip: string,
  port: number,
  path: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<DiscoveredServer | null> {
  const url = `http://${ip}:${port}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.any
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : signal,
      // no-cors can't validate the body; we rely on the endpoint having open CORS
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.stallion) return null;
    return {
      url: `http://${ip}:${json.port ?? port}`,
      name: json.name ?? ip,
      latency: Date.now() - t0,
    };
  } catch {
    return null;
  }
}

/** Collect all LAN IPs via RTCPeerConnection and derive /24 subnet prefixes */
function detectSubnets(): Promise<string[]> {
  return new Promise((resolve) => {
    const ips = new Set<string>();
    const done = () => {
      const subnets = [...new Set([...ips].map(toSubnetPrefix))];
      resolve(subnets.length > 0 ? subnets : ['192.168.1.']);
    };

    const timer = setTimeout(done, 2500);

    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const match = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(
          e.candidate.candidate,
        );
        if (match) {
          const ip = match[1];
          if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) {
            ips.add(ip);
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          pc.close();
          done();
        }
      };

      pc.createOffer().then((o) => pc.setLocalDescription(o));
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

/** '192.168.1.42' → '192.168.1.' */
function toSubnetPrefix(ip: string): string {
  return ip.split('.').slice(0, 3).join('.') + '.';
}

function dedup(servers: DiscoveredServer[]): DiscoveredServer[] {
  const seen = new Set<string>();
  return servers.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
