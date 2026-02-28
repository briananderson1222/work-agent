/**
 * Default provider implementations — no external dependencies
 */

import { userInfo as osUserInfo } from 'node:os';
import type { ToolDef } from '../domain/types.js';
import { checkBedrockCredentials } from './bedrock.js';
import type {
  AuthStatus,
  IAgentRegistryProvider,
  IAuthProvider,
  IBrandingProvider,
  InstallResult,
  IOnboardingProvider,
  ISettingsProvider,
  IToolRegistryProvider,
  IUserDirectoryProvider,
  IUserIdentityProvider,
  Prerequisite,
  RegistryItem,
  RenewResult,
  UserDetailVM,
  UserIdentity,
} from './types.js';

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

export class DefaultToolRegistryProvider implements IToolRegistryProvider {
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

// ── Onboarding Default ─────────────────────────────────

export class DefaultOnboardingProvider implements IOnboardingProvider {
  async getPrerequisites(): Promise<Prerequisite[]> {
    const hasCreds = await checkBedrockCredentials();
    return [
      {
        id: 'bedrock',
        name: 'Bedrock Credentials',
        description: 'AWS credentials for model access',
        status: hasCreds ? 'installed' : 'missing',
        category: 'required' as const,
        ...(!hasCreds && {
          installGuide: {
            steps: ['Configure AWS credentials with Bedrock access'],
            commands: ['aws configure', 'aws sts get-caller-identity'],
            links: [
              'https://docs.aws.amazon.com/bedrock/latest/userguide/setting-up.html',
            ],
          },
        }),
      },
    ];
  }
}

// ── Branding Default ───────────────────────────────────

export class DefaultBrandingProvider implements IBrandingProvider {
  async getAppName(): Promise<string> {
    return 'Work Agent';
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
