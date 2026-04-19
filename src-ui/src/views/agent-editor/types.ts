import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import type { Dispatch, SetStateAction } from 'react';
import type { NavigationView, Tool } from '../../types';

export interface AgentFormData {
  slug: string;
  name: string;
  description: string;
  prompt: string;
  modelId: string;
  region: string;
  guardrails: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    maxSteps?: number;
  } | null;
  maxSteps: string;
  tools: {
    mcpServers: string[];
    available: string[];
    autoApprove: string[];
  };
  execution: {
    runtimeConnectionId: string;
    modelConnectionId: string;
    runtimeOptions: Record<string, unknown>;
  };
  icon: string;
  skills: string[];
  prompts: string[];
}

export type AgentEditorTab =
  | 'basic'
  | 'skills'
  | 'tools'
  | 'commands'
  | 'runtime'
  | 'connection';

export type AgentType = 'managed' | 'connected' | 'acp';

export interface AgentEditorFormProps {
  form: AgentFormData;
  setForm: Dispatch<SetStateAction<AgentFormData>>;
  isCreating: boolean;
  locked: boolean;
  isPlugin: boolean | '' | undefined;
  isLocked: boolean;
  validationErrors: Record<string, string>;
  availableTools: Tool[];
  availableSkills: any[];
  availablePrompts: any[];
  integrationTools: Record<string, Tool[]>;
  appConfig: any;
  enrich: (prompt: string) => Promise<string | null>;
  isEnriching: boolean;
  onNavigate: (view: NavigationView) => void;
  onOpenAddModal: (type: 'integrations' | 'skills' | 'prompts') => void;
  runtimeConnections?: ConnectionConfig[];
}
