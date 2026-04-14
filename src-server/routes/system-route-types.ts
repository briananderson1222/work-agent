import type { SkillService } from '../services/skill-service.js';

export interface SystemStatusDeps {
  getACPStatus: () => {
    connected: boolean;
    connections: Array<{ id: string; status: string }>;
  };
  listProviderConnections?: () => Array<{
    id: string;
    type: string;
    enabled: boolean;
    capabilities?: string[];
  }>;
  checkOllamaAvailability?: () => Promise<boolean>;
  getAppConfig: () => {
    region?: string;
    defaultModel: string;
    runtime?: string;
  };
  eventBus?: { emit: (event: string, data?: Record<string, unknown>) => void };
  appConfig?: { runtime?: string };
  port?: number;
  skillService?: SkillService;
}

export type ConfiguredProvider = {
  id: string;
  type: string;
  enabled: boolean;
  capabilities?: string[];
};

export type CapabilityState = {
  ready: boolean;
  source: string | null;
};

export type SystemRecommendation = {
  code:
    | 'configured-chat-ready'
    | 'configured-no-chat'
    | 'detected-provider'
    | 'runtime-only'
    | 'unconfigured';
  type: 'providers' | 'runtimes' | 'connections';
  actionLabel: string;
  title: string;
  detail: string;
  detectedProviderType?: string;
  detectedProviderLabel?: string;
};
