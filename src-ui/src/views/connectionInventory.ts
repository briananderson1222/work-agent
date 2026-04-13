import type { ConnectionConfig } from '@stallion-ai/contracts/tool';

export function isModelInventoryConnection(
  connection: ConnectionConfig,
): boolean {
  return (
    connection.kind === 'model' &&
    (connection.capabilities.includes('llm') ||
      connection.capabilities.includes('embedding'))
  );
}

export function getKnowledgeInventory(connections: ConnectionConfig[]): {
  vectorDb: ConnectionConfig | null;
  embeddingProvider: ConnectionConfig | null;
} {
  const modelConnections = connections.filter(
    (connection) => connection.kind === 'model',
  );
  return {
    vectorDb:
      modelConnections.find(
        (connection) =>
          connection.enabled && connection.capabilities.includes('vectordb'),
      ) ??
      modelConnections.find((connection) =>
        connection.capabilities.includes('vectordb'),
      ) ??
      null,
    embeddingProvider:
      modelConnections.find(
        (connection) =>
          connection.enabled && connection.capabilities.includes('embedding'),
      ) ?? null,
  };
}

export function findModelConnectionById(
  connections: ConnectionConfig[],
  id: string | null | undefined,
): ConnectionConfig | null {
  if (!id) {
    return null;
  }
  return (
    connections.find(
      (connection) => connection.kind === 'model' && connection.id === id,
    ) ?? null
  );
}
