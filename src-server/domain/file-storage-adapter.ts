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
  ProjectConfig,
  ProjectMetadata,
  ProviderConnectionConfig,
} from '@stallion-ai/shared';
import type {
  ConversationRecord,
  DocumentRecord,
  IStorageAdapter,
} from './storage-adapter.js';

/**
 * Filesystem implementation of IStorageAdapter.
 *
 * Storage layout:
 *   <projectHomeDir>/
 *   ├── projects/<slug>/
 *   │   ├── project.json
 *   │   └── layouts/<slug>.json
 *   └── config/
 *       └── providers.json
 */
export class FileStorageAdapter implements IStorageAdapter {
  constructor(private readonly projectHomeDir: string) {}

  // ── Projects ──────────────────────────────────────────────────────

  listProjects(): ProjectMetadata[] {
    const dir = join(this.projectHomeDir, 'projects');
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => {
        const p = join(dir, e.name, 'project.json');
        if (!existsSync(p)) return [];
        const config: ProjectConfig = JSON.parse(readFileSync(p, 'utf-8'));
        const layoutsDir = join(dir, e.name, 'layouts');
        const layoutCount = existsSync(layoutsDir)
          ? readdirSync(layoutsDir).filter((f) => f.endsWith('.json')).length
          : 0;
        return [
          {
            id: config.id,
            slug: config.slug,
            name: config.name,
            icon: config.icon,
            description: config.description,
            hasWorkingDirectory: !!config.workingDirectory,
            layoutCount,
            hasKnowledge: existsSync(
              join(dir, e.name, 'documents', 'metadata.json'),
            ),
            defaultProviderId: config.defaultProviderId,
          } satisfies ProjectMetadata,
        ];
      });
  }

  getProject(slug: string): ProjectConfig {
    const p = join(this.projectHomeDir, 'projects', slug, 'project.json');
    if (!existsSync(p)) throw new Error(`Project '${slug}' not found`);
    return JSON.parse(readFileSync(p, 'utf-8'));
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

  // ── Layouts ───────────────────────────────────────────────────────

  listLayouts(projectSlug: string): LayoutMetadata[] {
    const dir = join(this.projectHomeDir, 'projects', projectSlug, 'layouts');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => {
        const config: LayoutConfig = JSON.parse(
          readFileSync(join(dir, f), 'utf-8'),
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
    const p = join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'layouts',
      `${layoutSlug}.json`,
    );
    if (!existsSync(p))
      throw new Error(
        `Layout '${layoutSlug}' not found in project '${projectSlug}'`,
      );
    return JSON.parse(readFileSync(p, 'utf-8'));
  }

  saveLayout(projectSlug: string, config: LayoutConfig): void {
    const dir = join(this.projectHomeDir, 'projects', projectSlug, 'layouts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${config.slug}.json`),
      JSON.stringify(config, null, 2),
      'utf-8',
    );
  }

  deleteLayout(projectSlug: string, layoutSlug: string): void {
    const p = join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'layouts',
      `${layoutSlug}.json`,
    );
    if (!existsSync(p))
      throw new Error(
        `Layout '${layoutSlug}' not found in project '${projectSlug}'`,
      );
    rmSync(p, { force: true });
  }

  // ── Provider Connections ──────────────────────────────────────────

  private get providersPath(): string {
    return join(this.projectHomeDir, 'config', 'providers.json');
  }

  private readProviders(): ProviderConnectionConfig[] {
    if (!existsSync(this.providersPath)) return [];
    return JSON.parse(readFileSync(this.providersPath, 'utf-8'));
  }

  private writeProviders(providers: ProviderConnectionConfig[]): void {
    mkdirSync(join(this.projectHomeDir, 'config'), { recursive: true });
    writeFileSync(
      this.providersPath,
      JSON.stringify(providers, null, 2),
      'utf-8',
    );
  }

  listProviderConnections(): ProviderConnectionConfig[] {
    return this.readProviders();
  }

  getProviderConnection(id: string): ProviderConnectionConfig {
    const found = this.readProviders().find((p) => p.id === id);
    if (!found) throw new Error(`Provider connection '${id}' not found`);
    return found;
  }

  saveProviderConnection(config: ProviderConnectionConfig): void {
    const providers = this.readProviders();
    const idx = providers.findIndex((p) => p.id === config.id);
    if (idx >= 0) providers[idx] = config;
    else providers.push(config);
    this.writeProviders(providers);
  }

  deleteProviderConnection(id: string): void {
    const providers = this.readProviders();
    const idx = providers.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`Provider connection '${id}' not found`);
    providers.splice(idx, 1);
    this.writeProviders(providers);
  }

  // ── Conversations ─────────────────────────────────────────────────

  private conversationsFile(projectSlug: string): string {
    return join(
      this.projectHomeDir,
      'projects',
      projectSlug,
      'conversations.json',
    );
  }

  private readConversations(projectSlug: string): ConversationRecord[] {
    const f = this.conversationsFile(projectSlug);
    if (!existsSync(f)) return [];
    return JSON.parse(readFileSync(f, 'utf-8'));
  }

  private writeConversations(
    projectSlug: string,
    records: ConversationRecord[],
  ): void {
    const f = this.conversationsFile(projectSlug);
    mkdirSync(join(f, '..'), { recursive: true });
    writeFileSync(f, JSON.stringify(records, null, 2), 'utf-8');
  }

  listConversations(
    projectSlug: string,
    opts?: { limit?: number; offset?: number },
  ): ConversationRecord[] {
    let records = this.readConversations(projectSlug);
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (opts?.offset) records = records.slice(opts.offset);
    if (opts?.limit) records = records.slice(0, opts.limit);
    return records;
  }

  getConversation(id: string): ConversationRecord | null {
    const dir = join(this.projectHomeDir, 'projects');
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const records = this.readConversations(entry.name);
      const found = records.find((r) => r.id === id);
      if (found) return found;
    }
    return null;
  }

  saveConversation(record: ConversationRecord): void {
    // Derive projectSlug from projectId by scanning projects
    let projectSlug = '';
    const dir = join(this.projectHomeDir, 'projects');
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pFile = join(dir, entry.name, 'project.json');
        if (!existsSync(pFile)) continue;
        const p: { id: string } = JSON.parse(readFileSync(pFile, 'utf-8'));
        if (p.id === record.projectId) {
          projectSlug = entry.name;
          break;
        }
      }
    }
    if (!projectSlug)
      throw new Error(`Project not found for id: ${record.projectId}`);
    const records = this.readConversations(projectSlug);
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    this.writeConversations(projectSlug, records);
  }

  deleteConversation(id: string): void {
    const dir = join(this.projectHomeDir, 'projects');
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const records = this.readConversations(entry.name);
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) {
        records.splice(idx, 1);
        this.writeConversations(entry.name, records);
        return;
      }
    }
  }

  // ── Documents ─────────────────────────────────────────────────────

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
    const f = this.documentsFile(projectSlug);
    if (!existsSync(f)) return [];
    return JSON.parse(readFileSync(f, 'utf-8'));
  }

  private writeDocuments(projectSlug: string, records: DocumentRecord[]): void {
    const f = this.documentsFile(projectSlug);
    mkdirSync(join(f, '..'), { recursive: true });
    writeFileSync(f, JSON.stringify(records, null, 2), 'utf-8');
  }

  listDocuments(projectSlug: string): DocumentRecord[] {
    return this.readDocuments(projectSlug);
  }

  getDocument(id: string): DocumentRecord | null {
    const dir = join(this.projectHomeDir, 'projects');
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const records = this.readDocuments(entry.name);
      const found = records.find((r) => r.id === id);
      if (found) return found;
    }
    return null;
  }

  saveDocument(record: DocumentRecord): void {
    // Find project slug from projectId
    let projectSlug = '';
    const dir = join(this.projectHomeDir, 'projects');
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pFile = join(dir, entry.name, 'project.json');
        if (!existsSync(pFile)) continue;
        const p: { id: string } = JSON.parse(readFileSync(pFile, 'utf-8'));
        if (p.id === record.projectId) {
          projectSlug = entry.name;
          break;
        }
      }
    }
    if (!projectSlug)
      throw new Error(`Project not found for id: ${record.projectId}`);
    const records = this.readDocuments(projectSlug);
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    this.writeDocuments(projectSlug, records);
  }

  deleteDocument(id: string): void {
    const dir = join(this.projectHomeDir, 'projects');
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const records = this.readDocuments(entry.name);
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) {
        records.splice(idx, 1);
        this.writeDocuments(entry.name, records);
        return;
      }
    }
  }

  // ── Layout Templates ──────────────────────────────────────────────

  private get templatesPath(): string {
    return join(this.projectHomeDir, 'config', 'templates.json');
  }

  private readTemplates(): LayoutTemplate[] {
    if (!existsSync(this.templatesPath)) return [];
    return JSON.parse(readFileSync(this.templatesPath, 'utf-8'));
  }

  private writeTemplates(templates: LayoutTemplate[]): void {
    mkdirSync(join(this.projectHomeDir, 'config'), { recursive: true });
    writeFileSync(
      this.templatesPath,
      JSON.stringify(templates, null, 2),
      'utf-8',
    );
  }

  listTemplates(): LayoutTemplate[] {
    return this.readTemplates();
  }

  getTemplate(id: string): LayoutTemplate | null {
    return this.readTemplates().find((t) => t.id === id) ?? null;
  }

  saveTemplate(template: LayoutTemplate): void {
    const templates = this.readTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) templates[idx] = template;
    else templates.push(template);
    this.writeTemplates(templates);
  }

  deleteTemplate(id: string): void {
    const templates = this.readTemplates();
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error(`Template '${id}' not found`);
    templates.splice(idx, 1);
    this.writeTemplates(templates);
  }
}
