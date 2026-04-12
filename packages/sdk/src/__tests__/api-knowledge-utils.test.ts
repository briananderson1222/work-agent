import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeFilterQuery,
  knowledgeBase,
} from '../api-knowledge-utils';

describe('api-knowledge-utils', () => {
  test('knowledgeBase encodes project slugs and namespaces', () => {
    expect(
      knowledgeBase('http://localhost:3141', 'proj slug', 'notes/core'),
    ).toBe(
      'http://localhost:3141/api/projects/proj%20slug/knowledge/ns/notes%2Fcore',
    );
  });

  test('buildKnowledgeFilterQuery serializes known filters', () => {
    expect(
      buildKnowledgeFilterQuery({
        tags: ['alpha', 'beta'],
        after: '2026-01-01',
        before: '2026-01-31',
        pathPrefix: 'docs/',
        status: 'indexed',
        metadata: { owner: 'brian', version: 2 },
      }),
    ).toBe(
      'tags=alpha%2Cbeta&after=2026-01-01&before=2026-01-31&pathPrefix=docs%2F&status=indexed&metadata.owner=brian&metadata.version=2',
    );
  });
});
