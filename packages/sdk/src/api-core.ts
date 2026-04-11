import type { LayoutDefinition } from '@stallion-ai/contracts/layout';
import {
  _setLayoutContext as _setLayoutContextResolver,
  resolveAgentName,
} from './agentResolver';

let _apiBase = '';
let _currentLayout: LayoutDefinition | undefined;

export function _setApiBase(apiBase: string) {
  _apiBase = apiBase;
}

export function _setLayoutContext(layout: LayoutDefinition | undefined) {
  _currentLayout = layout;
  _setLayoutContextResolver(layout);
}

export function _resolveAgent(agentSlug: string): string {
  return resolveAgentName(agentSlug, _currentLayout);
}

export function _getPluginName(): string {
  return _currentLayout?.slug || '';
}

export async function _getApiBase(): Promise<string> {
  let attempts = 0;
  while (!_apiBase && attempts < 50) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    attempts++;
  }

  if (!_apiBase) {
    throw new Error('API base not configured. Ensure SDKProvider is mounted.');
  }
  return _apiBase;
}

export function getPluginHeaders(
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    'x-stallion-plugin': _getPluginName(),
    ...extraHeaders,
  };
}
