import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FileStorageAdapter } from './file-storage-adapter.js';
import { runOrchestrationEventMigration } from './migrations/003-orchestration-events.js';

export async function runStartupMigrations(
  projectHomeDir: string,
): Promise<void> {
  runOrchestrationEventMigration(projectHomeDir);

  // Seed default provider connections (runs every startup, idempotent)
  const storageAdapter = new FileStorageAdapter(projectHomeDir);
  const existing = storageAdapter.listProviderConnections();
  if (!existing.some((c) => c.capabilities.includes('vectordb'))) {
    storageAdapter.saveProviderConnection({
      id: 'lancedb-builtin',
      type: 'lancedb',
      name: 'Built-in Vector Store',
      config: { dataDir: `${projectHomeDir}/vectordb` },
      enabled: true,
      capabilities: ['vectordb'] as ('llm' | 'embedding' | 'vectordb')[],
    });
  }
  if (!existing.some((c) => c.capabilities.includes('llm'))) {
    storageAdapter.saveProviderConnection({
      id: 'bedrock-default',
      type: 'bedrock',
      name: 'Amazon Bedrock',
      config: { region: '' },
      enabled: true,
      capabilities: ['llm', 'embedding'] as (
        | 'llm'
        | 'embedding'
        | 'vectordb'
      )[],
    });
  }

  const projectsDir = join(projectHomeDir, 'projects');
  mkdirSync(projectsDir, { recursive: true });
}
