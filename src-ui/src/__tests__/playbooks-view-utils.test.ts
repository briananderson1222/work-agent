import { describe, expect, it } from 'vitest';
import {
  buildPlaybookCategories,
  buildPlaybookListItems,
  filterAndSortPlaybooks,
} from '../views/playbooks/view-utils';

const playbooks = [
  {
    id: 'b',
    name: 'Beta',
    content: 'beta',
    updatedAt: '2025-01-02T00:00:00.000Z',
    category: 'Ops',
    tags: ['deploy', 'ship'],
  },
  {
    id: 'a',
    name: 'Alpha',
    content: 'alpha',
    updatedAt: '2025-01-03T00:00:00.000Z',
    category: 'Research',
    tags: ['spec'],
  },
  {
    id: 'c',
    name: 'Gamma',
    content: 'gamma',
    updatedAt: '2025-01-01T00:00:00.000Z',
    category: 'Ops',
    tags: ['review'],
  },
];

describe('playbooks view utils', () => {
  it('builds unique categories', () => {
    expect(buildPlaybookCategories(playbooks as any)).toEqual([
      'Ops',
      'Research',
    ]);
  });

  it('filters and sorts playbooks', () => {
    expect(
      filterAndSortPlaybooks(playbooks as any, 'ops', 'name').map(
        (item) => item.id,
      ),
    ).toEqual(['b', 'c']);
    expect(
      filterAndSortPlaybooks(playbooks as any, '', 'date').map(
        (item) => item.id,
      ),
    ).toEqual(['a', 'b', 'c']);
  });

  it('builds list items with subtitle summary', () => {
    expect(buildPlaybookListItems(playbooks as any)).toEqual([
      { id: 'b', name: 'Beta', subtitle: 'Ops · deploy, ship' },
      { id: 'a', name: 'Alpha', subtitle: 'Research · spec' },
      { id: 'c', name: 'Gamma', subtitle: 'Ops · review' },
    ]);
  });
});
