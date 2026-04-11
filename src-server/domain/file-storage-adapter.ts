import {
  existsSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
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
import type {
  ConversationRecord,
  DocumentRecord,
  IStorageAdapter,
  LayoutAgentReference,
} from './storage-adapter.js';
import {
  listProjectSlugs,
  readJsonFile,
  resolveProjectSlugById,
  writeJsonFile,
} from './file-storage-helpers.js';

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
        const config: ProjectConfig = JSON.parse(readFileSync(projectPath, 'utf-8'));
        const layoutsDir = join(dir, entry.name, 'layouts');
        const layoutCount = existsSync(layoutsDir)
          ? readdirSync(layoutsDir).filter((file) => file.endsWith('.json')).length
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
    const references: LayoutAgentReference[] = [];

    for (const project of this.listProjects()) {
      for (const layout of this.listLayouts(project.slug)) {
        const config = this.getLayout(project.slug, layout.slug).config as {
          tabs?: Array<{
            prompts?: Array<{ agent?: string }>;
            actions?: Array<{ agent?: string }>;
          }>;
          globalPrompts?: Array<{ agent?: string }>;
          actions?: Array<{ agent?: string }>;
          defaultAgent?: string;
          availableAgents?: string[];
        };

        const tabs = config.tabs ?? [];
        const isReferencedInTabs = tabs.some(
          (tab) =>
            (tab.prompts ?? []).some((prompt) => prompt.agent === agentSlug) ||
            (tab.actions ?? []).some((action) => action.agent === agentSlug),
        );
        const isReferencedGlobally =
          (config.globalPrompts ?? []).some(
            (prompt) => prompt.agent === agentSlug,
          ) ||
          (config.actions ?? []).some((action) => action.agent === agentSlug);
        const isConfiguredAgent =
          config.defaultAgent === agentSlug ||
          (config.availableAgents ?? []).includes(agentSlug);

        if (isReferencedInTabs || isReferencedGlobally || isConfiguredAgent) {
          references.push({
            projectSlug: project.slug,
            layoutSlug: layout.slug,
          });
        }
      }
    }

    return references;
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
    return join(this.projectHomeDir, 'projects', projectSlug, 'conversations.json');
  }

  private readConversations(projectSlug: string): ConversationRecord[] {
    return readJsonFile(this.conversationsFile(projectSlug), []);
  }

  private writeConversations(
    projectSlug: string,
    records: ConversationRecord[],
  ): void {
    writeJsonFile(this.conversationsFile(projectSlug), records);
  }

  listConversations(
    projectSlug: string,
    opts?: { limit?: number; offset?: number },
  ): ConversationRecord[] {
    let records = this.readConversations(projectSlug);
    records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (opts?.offset) records = records.slice(opts.offset);
    if (opts?.limit) records = records.slice(0, opts.limit);
    return records;
  }

  getConversation(id: string): ConversationRecord | null {
    for (const slug of listProjectSlugs(this.projectHomeDir)) {
      const found = this.readConversations(slug).find(
        (conversation) => conversation.id === id,
      );
      if (found) return found;
    }
    return null;
  }

  saveConversation(record: ConversationRecord): void {
    const projectSlug = resolveProjectSlugById(this.projectHomeDir, record.projectId);
    const records = this.readConversations(projectSlug);
    const index = records.findIndex((conversation) => conversation.id === record.id);
    if (index >= 0) records[index] = record;
    else records.push(record);
    this.writeConversations(projectSlug, records);
  }

  deleteConversation(id: string): void {
    for (const slug of listProjectSlugs(this.projectHomeDir)) {
      const records = this.readConversations(slug);
      const index = records.findIndex((conversation) => conversation.id === id);
      if (index >= 0) {
        records.splice(index, 1);
        this.writeConversations(slug, records);
        return;
      }
    }
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

  private readDocuments(projectSlug: string): DocumentRecord[] {
    return readJsonFile(this.documentsFile(projectSlug), []);
  }

  private writeDocuments(projectSlug: string, records: DocumentRecord[]): void {
    writeJsonFile(this.documentsFile(projectSlug), records);
  }

  listDocuments(projectSlug: string): DocumentRecord[] {
    return this.readDocuments(projectSlug);
  }

  getDocument(id: string): DocumentRecord | null {
    for (const slug of listProjectSlugs(this.projectHomeDir)) {
      const found = this.readDocuments(slug).find(
        (document) => document.id === id,
      );
      if (found) return found;
    }
    return null;
  }

  saveDocument(record: DocumentRecord): void {
    const projectSlug = resolveProjectSlugById(this.projectHomeDir, record.projectId);
    const records = this.readDocuments(projectSlug);
    const index = records.findIndex((document) => document.id === record.id);
    if (index >= 0) records[index] = record;
    else records.push(record);
    this.writeDocuments(projectSlug, records);
  }

  deleteDocument(id: string): void {
    for (const slug of listProjectSlugs(this.projectHomeDir)) {
      const records = this.readDocuments(slug);
      const index = records.findIndex((document) => document.id === id);
      if (index >= 0) {
        records.splice(index, 1);
        this.writeDocuments(slug, records);
        return;
      }
    }
  }

  private get templatesPath(): string {
    return join(this.projectHomeDir, 'config', 'templates.json');
  }

  private readTemplates(): LayoutTemplate[] {
    return readJsonFile(this.templatesPath, []);
  }

  private writeTemplates(templates: LayoutTemplate[]): void {
    writeJsonFile(this.templatesPath, templates);
  }

  listTemplates(): LayoutTemplate[] {
    return this.readTemplates();
  }

  getTemplate(id: string): LayoutTemplate | null {
    return this.readTemplates().find((template) => template.id === id) ?? null;
  }

  saveTemplate(template: LayoutTemplate): void {
    const templates = this.readTemplates();
    const index = templates.findIndex((entry) => entry.id === template.id);
    if (index >= 0) templates[index] = template;
    else templates.push(template);
    this.writeTemplates(templates);
  }

  deleteTemplate(id: string): void {
    const templates = this.readTemplates();
    const index = templates.findIndex((template) => template.id === id);
    if (index < 0) throw new Error(`Template '${id}' not found`);
    templates.splice(index, 1);
    this.writeTemplates(templates);
  }
}
