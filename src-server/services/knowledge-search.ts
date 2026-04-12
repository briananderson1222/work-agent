import { knowledgeVectorNamespace } from './knowledge-storage.js';

export async function searchKnowledgeDocuments({
  projectSlug,
  query,
  topK,
  namespace,
  vectorDb,
  embeddingProvider,
  listNamespaces,
}: {
  projectSlug: string;
  query: string;
  topK: number;
  namespace?: string;
  vectorDb: {
    namespaceExists: (namespace: string) => Promise<boolean>;
    search: (
      namespace: string,
      queryVector: number[],
      topK: number,
    ) => Promise<any[]>;
  } | null;
  embeddingProvider: {
    embed: (texts: string[]) => Promise<number[][]>;
  } | null;
  listNamespaces: (
    projectSlug: string,
  ) => Array<{ id: string; behavior?: string }>;
}): Promise<any[]> {
  if (!vectorDb || !embeddingProvider) {
    return [];
  }

  const [queryVector] = await embeddingProvider.embed([query]);

  if (namespace) {
    const vectorNamespace = knowledgeVectorNamespace(projectSlug, namespace);
    if (!(await vectorDb.namespaceExists(vectorNamespace))) {
      return [];
    }
    return vectorDb.search(vectorNamespace, queryVector, topK);
  }

  const namespaces = listNamespaces(projectSlug).filter(
    (candidate) => candidate.behavior === 'rag',
  );
  const allResults: any[] = [];
  for (const namespaceConfig of namespaces) {
    const vectorNamespace = knowledgeVectorNamespace(
      projectSlug,
      namespaceConfig.id,
    );
    if (!(await vectorDb.namespaceExists(vectorNamespace))) {
      continue;
    }
    const results = await vectorDb.search(vectorNamespace, queryVector, topK);
    allResults.push(...results);
  }

  allResults.sort((left, right) => right.score - left.score);
  return allResults.slice(0, topK);
}
