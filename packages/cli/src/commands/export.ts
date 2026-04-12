import { writeFileSync } from 'node:fs';
import type { PortabilityFormat } from '@stallion-ai/contracts/portability';
import {
  buildAgentsMdDocument,
  buildClaudeDesktopConfig,
  serializeAgentsMd,
  serializeClaudeDesktopConfig,
} from '@stallion-ai/shared/portability';
import { readPortabilitySnapshot } from './portability-io.js';

export interface ExportCommandOptions {
  format: PortabilityFormat;
  output?: string;
  projectHome?: string;
}

export function exportConfig(options: ExportCommandOptions): string {
  const snapshot = readPortabilitySnapshot(options.projectHome);
  let output: string;

  if (options.format === 'agents-md') {
    const document = buildAgentsMdDocument(snapshot);
    output = serializeAgentsMd(document);
  } else if (options.format === 'claude-desktop') {
    const config = buildClaudeDesktopConfig({
      integrations: snapshot.integrations,
    });
    output = serializeClaudeDesktopConfig(config.config);
  } else {
    throw new Error(`Unsupported export format: ${options.format}`);
  }

  if (options.output) {
    writeFileSync(options.output, output, 'utf-8');
    console.log(`  ✓ exported ${options.format} to ${options.output}`);
  } else {
    console.log(output);
  }

  return output;
}
