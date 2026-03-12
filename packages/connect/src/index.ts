// Core (framework-agnostic)
export { ConnectionStore } from './core/ConnectionStore';
export { defaultStorage, LocalStorageAdapter } from './core/storage';
export type {
  ConnectionStatus,
  DiscoveredServer,
  SavedConnection,
  StorageAdapter,
} from './core/types';
export type { ConnectionManagerModalProps } from './react/ConnectionManagerModal';
export { ConnectionManagerModal } from './react/ConnectionManagerModal';
export type { ConnectionStatusDotProps } from './react/ConnectionStatusDot';
export { ConnectionStatusDot } from './react/ConnectionStatusDot';
// React
export {
  ConnectionsProvider,
  useConnections,
} from './react/ConnectionsContext';
export type { QRDisplayProps } from './react/QRDisplay';
export { QRDisplay } from './react/QRDisplay';
export type { QRScannerProps } from './react/QRScanner';
export { QRScanner } from './react/QRScanner';
export type {
  ConnectionStatusResult,
  UseConnectionStatusOptions,
} from './react/useConnectionStatus';
export { useConnectionStatus } from './react/useConnectionStatus';
export type { UseHostUrlOptions, UseHostUrlResult } from './react/useHostUrl';
export { useHostUrl } from './react/useHostUrl';
export type {
  UseNetworkDiscoveryOptions,
  UseNetworkDiscoveryResult,
} from './react/useNetworkDiscovery';
export { useNetworkDiscovery } from './react/useNetworkDiscovery';
