import { writeFileSync } from 'node:fs';
import type { PortabilityFormat } from '@stallion-ai/contracts/portability';
import {
  buildAgentsMdDocument,
  serializeAgentsMd,
} from '@stallion-ai/shared/portability';
import { readPortabilitySnapshot } from './portability-io.js';

export interface ExportCommandOptions {
  format: PortabilityFormat;
  output?: string;
  projectHome?: string;
}

export function exportConfig(options: ExportCommandOptions): string {
  if (options.format !== 'agents-md') {
    throw new Error(
      `Export format '${options.format}' is not implemented in Phase 4a.`,
    );
  }

  const snapshot = readPortabilitySnapshot(options.projectHome);
  const document = buildAgentsMdDocument(snapshot);
  const output = serializeAgentsMd(document);

  if (options.output) {
    writeFileSync(options.output, output, 'utf-8');
    console.log(`  ✓ exported ${options.format} to ${options.output}`);
  } else {
    console.log(output);
  }

  return output;
}
