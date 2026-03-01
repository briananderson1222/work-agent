// Core (framework-agnostic)
export { ConnectionStore } from './core/ConnectionStore';
export { LocalStorageAdapter, defaultStorage } from './core/storage';
export type { SavedConnection, StorageAdapter, ConnectionStatus, DiscoveredServer } from './core/types';

// React
export { ConnectionsProvider, useConnections } from './react/ConnectionsContext';
export { useConnectionStatus } from './react/useConnectionStatus';
export type { UseConnectionStatusOptions, ConnectionStatusResult } from './react/useConnectionStatus';
export { useHostUrl } from './react/useHostUrl';
export type { UseHostUrlOptions, UseHostUrlResult } from './react/useHostUrl';
export { QRDisplay } from './react/QRDisplay';
export type { QRDisplayProps } from './react/QRDisplay';
export { QRScanner } from './react/QRScanner';
export type { QRScannerProps } from './react/QRScanner';
export { ConnectionManagerModal } from './react/ConnectionManagerModal';
export type { ConnectionManagerModalProps } from './react/ConnectionManagerModal';
export { ConnectionStatusDot } from './react/ConnectionStatusDot';
export type { ConnectionStatusDotProps } from './react/ConnectionStatusDot';
export { useNetworkDiscovery } from './react/useNetworkDiscovery';
export type { UseNetworkDiscoveryOptions, UseNetworkDiscoveryResult } from './react/useNetworkDiscovery';
