import type { PluginManifest, Permission } from '../types';

export class WorkspaceAPI {
  constructor(private manifest: PluginManifest) {}

  getManifest(): PluginManifest {
    return this.manifest;
  }

  hasCapability(capability: string): boolean {
    return this.manifest.capabilities.includes(capability);
  }

  async requestPermission(permission: string): Promise<boolean> {
    if (this.manifest.permissions.includes(permission)) {
      return true;
    }
    // Permission dialog would be shown by core
    return false;
  }

  getPermissions(): string[] {
    return this.manifest.permissions;
  }
}
