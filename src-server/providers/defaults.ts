/**
 * Default provider implementations — no external dependencies
 */

import { userInfo as osUserInfo } from 'node:os';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import type {
  AuthStatus,
  InstallResult,
  RegistryItem,
  RenewResult,
  UserDetailVM,
  UserIdentity,
} from './provider-contracts.js';
import type {
  IAgentRegistryProvider,
  IAuthProvider,
  IBrandingProvider,
  IIntegrationRegistryProvider,
  ISettingsProvider,
  IUserDirectoryProvider,
  IUserIdentityProvider,
} from './provider-interfaces.js';

// ── Package Registry Defaults ──────────────────────────

const NO_REGISTRY: InstallResult = {
  success: false,
  message: 'No registry provider configured',
};

export class DefaultAgentRegistryProvider implements IAgentRegistryProvider {
  async listAvailable(): Promise<RegistryItem[]> {
    return [];
  }
  async listInstalled(): Promise<RegistryItem[]> {
    return [];
  }
  async install(): Promise<InstallResult> {
    return NO_REGISTRY;
  }
  async uninstall(): Promise<InstallResult> {
    return NO_REGISTRY;
  }
}

export class DefaultIntegrationRegistryProvider
  implements IIntegrationRegistryProvider
{
  async listAvailable(): Promise<RegistryItem[]> {
    return [];
  }
  async listInstalled(): Promise<RegistryItem[]> {
    return [];
  }
  async install(): Promise<InstallResult> {
    return NO_REGISTRY;
  }
  async uninstall(): Promise<InstallResult> {
    return NO_REGISTRY;
  }
  async getToolDef(): Promise<ToolDef | null> {
    return null;
  }
  async sync(): Promise<void> {}
}

// ── Auth / Identity / Directory Defaults ───────────────

export class DefaultAuthProvider implements IAuthProvider {
  async getStatus(): Promise<AuthStatus> {
    return {
      provider: 'none',
      status: 'valid',
      expiresAt: null,
      message: 'No auth provider configured',
    };
  }
  async renew(): Promise<RenewResult> {
    return { success: false, message: 'No auth provider configured' };
  }
}

export class DefaultUserIdentityProvider implements IUserIdentityProvider {
  async getIdentity(): Promise<UserIdentity> {
    const alias = osUserInfo().username;
    return { alias };
  }
}

export class DefaultUserDirectoryProvider implements IUserDirectoryProvider {
  async lookupPerson(alias: string): Promise<UserDetailVM> {
    return { alias, name: alias };
  }
  async searchPeople(_query: string): Promise<UserDetailVM[]> {
    return [];
  }
}

// ── Branding Default ───────────────────────────────────

export class DefaultBrandingProvider implements IBrandingProvider {
  async getAppName(): Promise<string> {
    return 'Stallion';
  }
  async getLogo() {
    return null;
  }
  async getTheme() {
    return null;
  }
  async getWelcomeMessage() {
    return null;
  }
}

// ── Settings Default ───────────────────────────────────

export class DefaultSettingsProvider implements ISettingsProvider {
  async getDefaults() {
    return {};
  }
}
