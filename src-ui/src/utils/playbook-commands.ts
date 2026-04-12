import type { Playbook } from '@stallion-ai/contracts/catalog';
import { promptSlug } from '../slashCommands/utils';

export function findMatchingPlaybookCommand(
  playbooks: Playbook[] | undefined,
  cmd: string,
  agentSlug: string | null | undefined,
): Playbook | undefined {
  const agentMatch = playbooks?.find(
    (playbook) =>
      !!agentSlug &&
      playbook.agent === agentSlug &&
      promptSlug(playbook.name) === cmd,
  );
  if (agentMatch) {
    return agentMatch;
  }

  return playbooks?.find(
    (playbook) => promptSlug(playbook.name) === cmd && playbook.global,
  );
}
