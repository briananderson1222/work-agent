import { createContext, useContext } from 'react';
import { AgentsAPI } from './agents';
import { ToolsAPI } from './tools';
import { EventsAPI } from './events';
import { KeyboardAPI } from './keyboard';
import { WindowAPI } from './window';
import { WorkspaceAPI } from './workspace';
import type { SDKConfig, PluginManifest } from './types';

export * from './types';

export class SDK {
  public apiBase: string;
  public agents: AgentsAPI;
  public tools: ToolsAPI;
  public events: EventsAPI;
  public keyboard: KeyboardAPI;
  public window: WindowAPI;
  public workspace: WorkspaceAPI;

  constructor(config: SDKConfig, manifest: PluginManifest) {
    this.apiBase = config.apiBase;
    this.agents = new AgentsAPI(config.apiBase, config.authToken);
    this.tools = new ToolsAPI(config.apiBase, config.authToken);
    this.events = new EventsAPI();
    this.keyboard = new KeyboardAPI();
    this.window = new WindowAPI();
    this.workspace = new WorkspaceAPI(manifest);
  }
}

const SDKContext = createContext<SDK | null>(null);

export const SDKProvider = SDKContext.Provider;

export function useSDK(): SDK {
  const sdk = useContext(SDKContext);
  if (!sdk) throw new Error('useSDK must be used within SDKProvider');
  return sdk;
}

export function useAgents() {
  return useSDK().agents;
}

export function useTools() {
  return useSDK().tools;
}

export function useEvents() {
  return useSDK().events;
}

export function useKeyboard() {
  return useSDK().keyboard;
}

export function useWindow() {
  return useSDK().window;
}

export function useWorkspace() {
  return useSDK().workspace;
}
