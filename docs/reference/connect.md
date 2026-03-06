# @stallion-ai/connect

Multi-device connectivity package. Handles QR pairing, network discovery, and connection persistence. Framework-agnostic core with optional React bindings.

---

## types

### `SavedConnection`

A persisted server connection entry.

```ts
interface SavedConnection {
  id: string;
  name: string;
  url: string;
  lastConnected?: number; // unix ms
}
```

### `StorageAdapter`

Interface for pluggable storage backends.

```ts
interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
```

### `ConnectionStatus`

```ts
type ConnectionStatus = 'connected' | 'connecting' | 'error';
```

### `DiscoveredServer`

A server found via LAN scan.

```ts
interface DiscoveredServer {
  url: string;
  name: string;
  latency: number; // ms
}
```

---

## storage adapters

### `LocalStorageAdapter`

Wraps `window.localStorage`. Silently swallows quota errors and SSR exceptions.

```ts
import { LocalStorageAdapter } from '@stallion-ai/connect';

const storage = new LocalStorageAdapter();
storage.set('key', 'value');
storage.get('key'); // 'value'
storage.remove('key');
```

### `defaultStorage`

A pre-constructed `LocalStorageAdapter` singleton. Used by `ConnectionStore` when no custom adapter is provided.

```ts
import { defaultStorage } from '@stallion-ai/connect';
```

---

## ConnectionStore

Framework-agnostic store for managing saved connections. Compatible with React's `useSyncExternalStore` via the `subscribe` method.

```ts
import { ConnectionStore } from '@stallion-ai/connect';

const store = new ConnectionStore({
  storage?: StorageAdapter,   // default: defaultStorage
  storageKey?: string,        // default: 'stallion-connect-connections'
});
```

### methods

#### `getAll(): SavedConnection[]`

Returns all saved connections. Result is referentially stable between writes (cached).

#### `getActive(): SavedConnection | null`

Returns the currently active connection, or the first connection if no active ID is set.

#### `add(name: string, url: string): SavedConnection`

Adds a new connection and activates it. If a connection with the same URL already exists, activates it instead and returns the existing entry.

#### `remove(id: string): void`

Removes a connection by ID. If it was active, the first remaining connection becomes active.

#### `update(id: string, changes: Partial<Pick<SavedConnection, 'name' | 'url'>>): void`

Updates the name or URL of an existing connection.

#### `setActive(id: string): void`

Sets the active connection and stamps `lastConnected` with the current timestamp.

#### `subscribe(fn: () => void): () => void`

Registers a change listener. Returns an unsubscribe function. Used internally by `ConnectionsProvider`.

```ts
const unsub = store.subscribe(() => console.log('changed'));
unsub(); // cleanup
```

#### `migrate(legacyKey: string): void`

One-time migration helper. Reads a URL stored under a legacy single-URL key, imports it as a connection, and removes the old key.

```ts
store.migrate('project-stallion-api-base');
```

### example

```ts
const store = new ConnectionStore();
const conn = store.add('Local Dev', 'http://192.168.1.10:3141');
store.setActive(conn.id);
console.log(store.getActive()?.url); // 'http://192.168.1.10:3141'
```

---

## react

### `ConnectionsProvider`

Context provider that wraps a `ConnectionStore` and exposes it to the component tree. Creates a module-level singleton store on first render if no `store` prop is passed.

```tsx
import { ConnectionsProvider } from '@stallion-ai/connect';

<ConnectionsProvider
  defaultUrl="http://localhost:3141"  // used when no persisted data exists
  store={optionalCustomStore}         // optional: bring your own store
>
  {children}
</ConnectionsProvider>
```

**props**

| prop | type | default | description |
|---|---|---|---|
| `defaultUrl` | `string` | `'http://localhost:3141'` | Fallback URL when no connections are saved |
| `store` | `ConnectionStore` | module singleton | Custom store instance |
| `children` | `ReactNode` | — | — |

---

### `useConnections()`

Returns the full connections context. Must be called inside `ConnectionsProvider`.

```ts
const {
  connections,        // SavedConnection[]
  activeConnection,   // SavedConnection | null
  apiBase,            // string — active URL (backward-compat alias)
  addConnection,      // (name, url) => SavedConnection
  removeConnection,   // (id) => void
  updateConnection,   // (id, changes) => void
  setActiveConnection,// (id) => void
  setApiBase,         // (url) => void — upsert by URL and activate
  resetToDefault,     // () => void — activate or create the defaultUrl connection
  isCustom,           // boolean — true when active URL !== defaultUrl
} = useConnections();
```

**example**

```tsx
function ServerPicker() {
  const { connections, activeConnection, setActiveConnection } = useConnections();
  return (
    <select
      value={activeConnection?.id}
      onChange={(e) => setActiveConnection(e.target.value)}
    >
      {connections.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
```

---

### `useConnectionStatus(options)`

Polls a health-check function against the active connection URL and returns the current status.

**signature**

```ts
function useConnectionStatus(options: UseConnectionStatusOptions): ConnectionStatusResult
```

**types**

```ts
interface UseConnectionStatusOptions {
  checkHealth: (url: string) => Promise<boolean>;
  pollInterval?: number; // ms, default: 10_000
}

interface ConnectionStatusResult {
  status: ConnectionStatus;   // 'connected' | 'connecting' | 'error'
  checking: boolean;          // true while a check is in flight
  recheck: () => void;        // manually trigger a check
}
```

**example**

```tsx
const { status, recheck } = useConnectionStatus({
  checkHealth: async (url) => {
    const res = await fetch(`${url}/api/health`).catch(() => null);
    return res?.ok ?? false;
  },
  pollInterval: 15_000,
});
```

Resets to `'connecting'` whenever the active URL changes.

---

### `useHostUrl(options)`

Detects the device's LAN IP via `RTCPeerConnection` ICE candidates and returns a host URL suitable for QR display. Falls back to `localhost` if detection fails or times out (3 s).

**signature**

```ts
function useHostUrl(options: UseHostUrlOptions): UseHostUrlResult
```

**types**

```ts
interface UseHostUrlOptions {
  port: number;
  fallback?: string; // default: `http://localhost:${port}`
}

interface UseHostUrlResult {
  hostUrl: string;      // e.g. 'http://192.168.1.42:3141'
  isDetecting: boolean; // true while ICE gathering is in progress
}
```

**example**

```tsx
const { hostUrl, isDetecting } = useHostUrl({ port: 3141 });

return isDetecting
  ? <span>Detecting IP…</span>
  : <QRDisplay url={hostUrl} />;
```

---

### `useNetworkDiscovery(options?)`

Scans the local /24 subnet for Stallion servers by probing each host's discovery endpoint. Detects subnets via `RTCPeerConnection`, falls back to `192.168.1.x`.

**signature**

```ts
function useNetworkDiscovery(options?: UseNetworkDiscoveryOptions): UseNetworkDiscoveryResult
```

**types**

```ts
interface UseNetworkDiscoveryOptions {
  port?: number;          // default: 3141
  discoveryPath?: string; // default: '/api/system/discover'
  timeout?: number;       // per-probe timeout ms, default: 500
  batchSize?: number;     // parallel probes, default: 30
}

interface UseNetworkDiscoveryResult {
  scanning: boolean;
  discovered: DiscoveredServer[];
  scan: () => void; // trigger or re-trigger a scan
}
```

The discovery endpoint must return JSON with `{ stallion: true, name?: string, port?: number }`.

**example**

```tsx
const { scanning, discovered, scan } = useNetworkDiscovery({ port: 3141 });

useEffect(() => { scan(); }, []);

return discovered.map((s) => (
  <div key={s.url}>{s.name} — {s.latency}ms</div>
));
```

---

## components

### `ConnectionManagerModal`

Full-featured modal for managing connections. Includes list view, manual add, QR scanner, and LAN discovery panels.

**props**

```ts
interface ConnectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkHealth: (url: string) => Promise<boolean>;
}
```

Must be rendered inside `ConnectionsProvider`.

**example**

```tsx
<ConnectionManagerModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  checkHealth={async (url) => {
    const res = await fetch(`${url}/api/health`).catch(() => null);
    return res?.ok ?? false;
  }}
/>
```

---

### `QRDisplay`

Renders a QR code canvas for a given URL using the `qrcode` package (dynamically imported).

**props**

```ts
interface QRDisplayProps {
  url: string;
  size?: number;  // px, default: 160
  label?: string; // optional caption below the QR code
}
```

**example**

```tsx
<QRDisplay url="http://192.168.1.42:3141" size={200} label="Scan to connect" />
```

---

### `QRScanner`

Opens the device camera and decodes QR codes using `jsqr`. Calls `onScan` when a valid `http://` or `https://` URL is decoded. Requires a secure context (HTTPS or localhost) for camera access.

**props**

```ts
interface QRScannerProps {
  onScan: (url: string) => void;
  onCancel: () => void;
}
```

**example**

```tsx
<QRScanner
  onScan={(url) => {
    addConnection('', url);
    setShowScanner(false);
  }}
  onCancel={() => setShowScanner(false)}
/>
```

---

### `ConnectionStatusDot`

A small colored circle indicating connection status.

**props**

```ts
interface ConnectionStatusDotProps {
  status: ConnectionStatus; // 'connected' | 'connecting' | 'error'
  size?: number;            // px, default: 8
}
```

Colors: `connected` → green (`#22c55e`), `connecting` → yellow (`#eab308`), `error` → red (`#ef4444`).

**example**

```tsx
<ConnectionStatusDot status="connected" size={10} />
```
