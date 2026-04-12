import type { Playbook } from '@stallion-ai/contracts/catalog';

export interface PlaybookForm {
  name: string;
  content: string;
  description: string;
  category: string;
  tags: string;
  agent: string;
  global: boolean;
}

export const EMPTY_PLAYBOOK_FORM: PlaybookForm = {
  name: '',
  content: '',
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
  description: string;
  category: string;
}) {
  const parts = ['---', `name: "${form.name}"`];
  if (form.description) parts.push(`description: "${form.description}"`);
  if (form.category) parts.push(`category: "${form.category}"`);
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
  return 'authored locally';
}
