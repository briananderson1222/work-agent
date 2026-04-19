import type { GuidanceAsset, Playbook, Skill } from './catalog';

export function playbookToGuidanceAsset(playbook: Playbook): GuidanceAsset {
  return {
    id: playbook.id,
    kind: 'playbook',
    name: playbook.name,
    body: playbook.content,
    description: playbook.description,
    tags: playbook.tags,
    category: playbook.category,
    scope: {
      agent: playbook.agent,
      global: playbook.global,
    },
    source: playbook.source,
    storageMode: 'json-inline',
    runtimeMode:
      playbook.global || playbook.agent ? 'slash-command' : 'prompt-record',
    provenance: playbook.provenance,
    stats: playbook.stats,
    createdAt: playbook.createdAt,
    updatedAt: playbook.updatedAt,
  };
}

export function skillToGuidanceAsset(skill: Skill): GuidanceAsset {
  return {
    id: skill.id,
    kind: 'skill',
    name: skill.name,
    body: skill.body ?? '',
    description: skill.description,
    tags: skill.tags,
    source: skill.source,
    storageMode: skill.path ? 'skill-package' : 'markdown-file',
    runtimeMode: 'skill-catalog',
    packaging: {
      installable: true,
      installed: skill.installed,
      installedVersion: skill.installedVersion,
      version: skill.version,
      path: skill.path,
      source: skill.source,
      resources: skill.resources,
      scripts: skill.scripts,
    },
  };
}
