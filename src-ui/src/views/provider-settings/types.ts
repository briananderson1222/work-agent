import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import type { ReactNode } from 'react';

export type ProviderConnection = ConnectionConfig & { kind: 'model' };

export interface ProviderTypeOption {
  type: string;
  name: string;
  desc: string;
  icon: ReactNode;
}
