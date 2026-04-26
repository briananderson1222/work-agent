import type { Playbook } from '@stallion-ai/contracts/catalog';

export interface PlaybookForm {
  name: string;
  content: string;
  storageMode: 'json-inline' | 'markdown-file';
  description: string;
  category: string;
  tags: string;
  agent: string;
  global: boolean;
}

export const EMPTY_PLAYBOOK_FORM: PlaybookForm = {
  name: '',
  content: '',
  storageMode: 'json-inline',
  description: '',
  category: '',
  tags: '',
  agent: '',
  global: false,
};

export function playbookToForm(playbook: Playbook): PlaybookForm {
  return {
    name: playbook.name,
    content: playbook.content,
    storageMode: playbook.storageMode ?? 'json-inline',
    description: playbook.description ?? '',
    category: playbook.category ?? '',
    tags: (playbook.tags ?? []).join(', '),
    agent: playbook.agent ?? '',
    global: playbook.global ?? false,
  };
}

export function buildPlaybookPayload(form: PlaybookForm) {
  return {
    name: form.name,
    content: form.content,
    storageMode: form.storageMode,
    description: form.description || undefined,
    category: form.category || undefined,
    tags: form.tags
      ? form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined,
    agent: form.agent || undefined,
    global: form.global || undefined,
  };
}

export function extractTemplateVariables(content: string) {
  const matches = content.match(/\{\{([\w.-]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((match) => match.slice(2, -2)))];
}

export function buildPlaybookExportMarkdown(form: {
  name: string;
  content: string;
  storageMode?: 'json-inline' | 'markdown-file';
  description: string;
  category: string;
  tags?: string;
  agent?: string;
  global?: boolean;
}) {
  const parts = ['---', `name: "${form.name}"`];
  if (form.description) parts.push(`description: "${form.description}"`);
  if (form.category) parts.push(`category: "${form.category}"`);
  if (form.tags) {
    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length > 0) {
      parts.push('tags:');
      for (const tag of tags) parts.push(`  - ${tag}`);
    }
  }
  if (form.agent) parts.push(`agent: "${form.agent}"`);
  if (form.global) parts.push('global: true');
  if (form.storageMode === 'markdown-file') {
    parts.push('assetType: playbook');
    parts.push('runtimeMode: slash-command');
  }
  parts.push('---', '', form.content);
  return parts.join('\n');
}

export function buildPlaybookFilename(name: string) {
  return `${name.replace(/[^a-zA-Z0-9_-]/g, '-')}.md`;
}

export function formatPlaybookStatsSummary(playbook: Playbook): string | null {
  const runs = playbook.stats?.runs ?? 0;
  const score = playbook.stats?.qualityScore;

  if (runs === 0 && score == null) {
    return null;
  }

  const parts = [`${runs} run${runs === 1 ? '' : 's'}`];
  if (score != null) {
    parts.push(`${score}% success`);
  }
  return parts.join(' · ');
}

export function formatPlaybookProvenanceSummary(
  playbook: Playbook,
): string | null {
  const source =
    playbook.provenance?.updatedFrom ?? playbook.provenance?.createdFrom;
  if (!source) {
    return null;
  }
  if (source.kind === 'agent') {
    return source.agentSlug
      ? `refined by ${source.agentSlug}`
      : 'refined by agent';
  }
  if (source.kind === 'plugin') {
    return 'provided by plugin';
  }
  if (source.kind === 'asset') {
    const sourceName = source.asset?.name;
    if (source.action === 'skill-to-playbook') {
      return sourceName ? `created from ${sourceName}` : 'created from skill';
    }
    if (source.action === 'playbook-to-skill') {
      return sourceName
        ? `packaged from ${sourceName}`
        : 'packaged from playbook';
    }
    return sourceName ? `created from ${sourceName}` : 'created from asset';
  }
  return 'authored locally';
}
