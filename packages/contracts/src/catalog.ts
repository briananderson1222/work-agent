export interface Playbook {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  source?: string;
  requires?: string[];
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export type Prompt = Playbook;

export interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  status?: string;
  tags?: string[];
  installed: boolean;
}

export interface Skill extends RegistryItem {
  name: string;
  source?: string;
  path?: string;
  installedVersion?: string;
  updateAvailable?: boolean;
}

export interface InstallResult {
  success: boolean;
  message: string;
}
