import type { Playbook } from '@stallion-ai/contracts/catalog';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ImportPromptsModal } from '../../components/ImportPromptsModal';
import { PromptRunModal } from '../../components/PromptRunModal';
import type { PlaybookForm } from './utils';

type AgentOption = { slug: string; name: string };

interface PlaybooksModalStackProps {
  agents: AgentOption[];
  form: PlaybookForm;
  isDeleteOpen: boolean;
  isImportOpen: boolean;
  isRunOpen: boolean;
  selectedPrompt?: Playbook;
  templateVars: string[];
  onCancelDelete: () => void;
  onCancelImport: () => void;
  onCancelRun: () => void;
  onConfirmDelete: () => void;
  onImport: (
    items: {
      name: string;
      content: string;
      description?: string;
      category?: string;
      tags?: string[];
      agent?: string;
      global?: boolean;
      storageMode?: 'json-inline' | 'markdown-file';
    }[],
  ) => void;
  onRun: (resolvedContent: string, agentSlug: string) => Promise<void>;
}

export function PlaybooksModalStack({
  agents,
  form,
  isDeleteOpen,
  isImportOpen,
  isRunOpen,
  selectedPrompt,
  templateVars,
  onCancelDelete,
  onCancelImport,
  onCancelRun,
  onConfirmDelete,
  onImport,
  onRun,
}: PlaybooksModalStackProps) {
  return (
    <>
      <ConfirmModal
        isOpen={isDeleteOpen}
        title="Delete Playbook"
        message={`Delete "${selectedPrompt?.name ?? form.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <PromptRunModal
        isOpen={isRunOpen}
        prompt={{ name: form.name, content: form.content, agent: form.agent }}
        templateVars={templateVars}
        agents={agents}
        onRun={onRun}
        onCancel={onCancelRun}
      />

      <ImportPromptsModal
        isOpen={isImportOpen}
        onImport={onImport}
        onCancel={onCancelImport}
      />
    </>
  );
}
