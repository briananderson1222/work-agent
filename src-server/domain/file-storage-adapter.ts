import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  LayoutConfig,
  LayoutMetadata,
  LayoutTemplate,
} from '@stallion-ai/contracts/layout';
import type {
  ProjectConfig,
  ProjectMetadata,
} from '@stallion-ai/contracts/project';
import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';
import {
  buildLayoutAgentReferences,
  deleteProjectScopedRecord,
  deleteStoredRecord,
  findStoredRecordAcrossProjects,
  listSortedConversations,
  listStoredRecords,
  saveProjectScopedRecord,
  saveStoredRecord,
} from './file-storage-records.js';
import {
  readJsonFile,
  writeJsonFile,
} from './file-storage-helpers.js';
import type {
  ConversationRecord,
  DocumentRecord,
  IStorageAdapter,
  LayoutAgentReference,
} from './storage-adapter.js';

export class FileStorageAdapter implements IStorageAdapter {
  constructor(private readonly projectHomeDir: string) {}

  listProjects(): ProjectMetadata[] {
    const dir = join(this.projectHomeDir, 'projects');
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const projectPath = join(dir, entry.name, 'project.json');
        if (!existsSync(projectPath)) return [];
        const config: ProjectConfig = JSON.parse(
          readFileSync(projectPath, 'utf-8'),
        );
        const layoutsDir = join(dir, entry.name, 'layouts');
        const layoutCount = existsSync(layoutsDir)
          ? readdirSync(layoutsDir).filter((file) => file.endsWith('.json'))
              .length
          : 0;
        return [
          {
            id: config.id,
            slug: config.slug,
            name: config.name,
            icon: config.icon,
            description: config.description,
            hasWorkingDirectory: !!config.workingDirectory,
            workingDirectory: config.workingDirectory,
            layoutCount,
            hasKnowledge: existsSync(
              join(dir, entry.name, 'documents', 'metadata.json'),
            ),
            defaultProviderId: config.defaultProviderId,
          } satisfies ProjectMetadata,
        ];
      });
  }

  getProject(slug: string): ProjectConfig {
    const path = join(this.projectHomeDir, 'projects', slug, 'project.json');
    if (!existsSync(path)) throw new Error(`Project '${slug}' not found`);
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  saveProject(config: ProjectConfig): void {
    const dir = join(this.projectHomeDir, 'projects', config.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'project.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );
  }

  deleteProject(slug: string): void {
    const dir = join(this.projectHomeDir, 'projects', slug);
    if (!existsSync(dir)) throw new Error(`Project '${slug}' not found`);
    rmSync(dir, { recursive: true, force: true });
  }

  listLayouts(projectSlug: string): LayoutMetadata[] {
    const dir = join(this.projectHomeDir, 'projects', projectSlug, 'layouts');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) => {
        const config: LayoutConfig = JSON.parse(
          readFileSync(join(dir, file), 'utf-8'),
        );
        return [
          {
            id: config.id,
            slug: config.slug,
            projectSlug: config.projectSlug,
            type: config.type,
            name: config.name,
            icon: config.icon,
            description: config.description,
          } satisfies LayoutMetadata,
        ];
      });
  }

  getLayout(projectSlug: string, layoutSlug: string): LayoutConfig {
    const path = join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'layouts',
      `${layoutSlug}.json`,
    );
    if (!existsSync(path)) {
      throw new Error(
        `Layout '${layoutSlug}' not found in project '${projectSlug}'`,
      );
    }
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  saveLayout(projectSlug: string, config: LayoutConfig): void {
    writeJsonFile(
      join(
        this.projectHomeDir,
        'projects',
        projectSlug,
        'layouts',
        `${config.slug}.json`,
      ),
      config,
    );
  }

  deleteLayout(projectSlug: string, layoutSlug: string): void {
    const path = join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'layouts',
      `${layoutSlug}.json`,
    );
    if (!existsSync(path)) {
      throw new Error(
        `Layout '${layoutSlug}' not found in project '${projectSlug}'`,
      );
    }
    rmSync(path, { force: true });
  }

  findLayoutsUsingAgent(agentSlug: string): LayoutAgentReference[] {
    return buildLayoutAgentReferences(
      this.listProjects(),
      (projectSlug) => this.listLayouts(projectSlug),
      (projectSlug, layoutSlug) => this.getLayout(projectSlug, layoutSlug),
      agentSlug,
    );
  }

  private get providersPath(): string {
    return join(this.projectHomeDir, 'config', 'providers.json');
  }

  private readProviders(): ProviderConnectionConfig[] {
    return readJsonFile(this.providersPath, []);
  }

  private writeProviders(providers: ProviderConnectionConfig[]): void {
    writeJsonFile(this.providersPath, providers);
  }

  listProviderConnections(): ProviderConnectionConfig[] {
    return this.readProviders();
  }

  getProviderConnection(id: string): ProviderConnectionConfig {
    const found = this.readProviders().find((provider) => provider.id === id);
    if (!found) throw new Error(`Provider connection '${id}' not found`);
    return found;
  }

  saveProviderConnection(config: ProviderConnectionConfig): void {
    const providers = this.readProviders();
    const index = providers.findIndex((provider) => provider.id === config.id);
    if (index >= 0) providers[index] = config;
    else providers.push(config);
    this.writeProviders(providers);
  }

  deleteProviderConnection(id: string): void {
    const providers = this.readProviders();
    const index = providers.findIndex((provider) => provider.id === id);
    if (index < 0) throw new Error(`Provider connection '${id}' not found`);
    providers.splice(index, 1);
    this.writeProviders(providers);
  }

  private conversationsFile(projectSlug: string): string {
    return join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'conversations.json',
    );
  }

  listConversations(
    projectSlug: string,
    opts?: { limit?: number; offset?: number },
  ): ConversationRecord[] {
    return listSortedConversations(this.conversationsFile(projectSlug), opts);
  }

  getConversation(id: string): ConversationRecord | null {
    return findStoredRecordAcrossProjects(
      this.projectHomeDir,
      (projectSlug) => this.conversationsFile(projectSlug),
      id,
    );
  }

  saveConversation(record: ConversationRecord): void {
    saveProjectScopedRecord(
      this.projectHomeDir,
      (projectSlug) => this.conversationsFile(projectSlug),
      record,
    );
  }

  deleteConversation(id: string): void {
    deleteProjectScopedRecord<ConversationRecord>(
      this.projectHomeDir,
      (projectSlug) => this.conversationsFile(projectSlug),
      id,
    );
  }

  private documentsFile(projectSlug: string): string {
    return join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'documents',
      'metadata.json',
    );
  }

  listDocuments(projectSlug: string): DocumentRecord[] {
    return listStoredRecords(this.documentsFile(projectSlug), []);
  }

  getDocument(id: string): DocumentRecord | null {
    return findStoredRecordAcrossProjects(
      this.projectHomeDir,
      (projectSlug) => this.documentsFile(projectSlug),
      id,
    );
  }

  saveDocument(record: DocumentRecord): void {
    saveProjectScopedRecord(
      this.projectHomeDir,
      (projectSlug) => this.documentsFile(projectSlug),
      record,
    );
  }

  deleteDocument(id: string): void {
    deleteProjectScopedRecord<DocumentRecord>(
      this.projectHomeDir,
      (projectSlug) => this.documentsFile(projectSlug),
      id,
    );
  }

  private get templatesPath(): string {
    return join(this.projectHomeDir, 'config', 'templates.json');
  }

  listTemplates(): LayoutTemplate[] {
    return listStoredRecords(this.templatesPath, []);
  }

  getTemplate(id: string): LayoutTemplate | null {
    return listStoredRecords<LayoutTemplate>(this.templatesPath).find(
      (template) => template.id === id,
    ) ?? null;
  }

  saveTemplate(template: LayoutTemplate): void {
    saveStoredRecord(this.templatesPath, template);
  }

  deleteTemplate(id: string): void {
    if (!deleteStoredRecord<LayoutTemplate>(this.templatesPath, id)) {
      throw new Error(`Template '${id}' not found`);
    }
  }
}
