import type { Playbook } from '@stallion-ai/contracts/catalog';
import { formatPlaybookStatsSummary } from './utils';

export function buildPlaybookCategories(playbooks: Playbook[]): string[] {
  return [
    ...new Set(
      playbooks
        .map((playbook) => playbook.category)
        .filter(Boolean) as string[],
    ),
  ];
}

export function filterAndSortPlaybooks(
  playbooks: Playbook[],
  search: string,
  sortBy: 'name' | 'date' | 'category',
): Playbook[] {
  const query = search.toLowerCase();
  const filtered = playbooks.filter(
    (playbook) =>
      !query ||
      playbook.name.toLowerCase().includes(query) ||
      playbook.category?.toLowerCase().includes(query) ||
      playbook.tags?.some((tag) => tag.toLowerCase().includes(query)),
  );

  return filtered.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'category') {
      return (a.category ?? '').localeCompare(b.category ?? '');
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function buildPlaybookListItems(playbooks: Playbook[]) {
  return playbooks.map((playbook) => ({
    id: playbook.id,
    name: playbook.name,
    subtitle: [
      playbook.category,
      playbook.tags?.slice(0, 2).join(', '),
      formatPlaybookStatsSummary(playbook),
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}
