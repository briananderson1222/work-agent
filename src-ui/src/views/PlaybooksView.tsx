import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { GuidanceConversionModal } from './GuidanceConversionModal';
import { GuidanceTabs } from './GuidanceTabs';
import { PlaybooksEditor } from './playbooks/PlaybooksEditor';
import { PlaybooksModalStack } from './playbooks/PlaybooksModalStack';
import { usePlaybooksViewModel } from './playbooks/usePlaybooksViewModel';
import {
  buildPlaybookExportMarkdown,
  buildPlaybookFilename,
} from './playbooks/utils';
import './page-layout.css';
import './editor-layout.css';

export function PlaybooksView() {
  const viewModel = usePlaybooksViewModel();
  const DiscardModal = viewModel.DiscardModal;

  function handleExport() {
    const markdown = buildPlaybookExportMarkdown(viewModel.form);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = buildPlaybookFilename(viewModel.form.name);
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return (
    <div className="page page--full">
      <GuidanceTabs
        active="playbooks"
        onNavigate={viewModel.navigateWithGuard}
      />
      <SplitPaneLayout
        label="playbooks"
        title="Playbooks"
        subtitle="Reusable playbooks for layouts and agents"
        items={viewModel.listItems}
        loading={viewModel.isLoading}
        selectedId={viewModel.isNew ? '__new__' : viewModel.selectedId}
        onSelect={viewModel.selectPrompt}
        onDeselect={viewModel.handleDeselect}
        onSearch={viewModel.setSearch}
        searchPlaceholder="Search playbooks..."
        onAdd={viewModel.startNew}
        addLabel="+ New Playbook"
        listEmptyTitle="No playbooks yet"
        listEmptyDescription="Create a reusable playbook to capture guidance for layouts and agents."
        emptyIcon="⌘"
        emptyTitle="No playbook selected"
        emptyDescription="Select a playbook or create a new one"
        sidebarActions={
          <>
            <select
              className="editor-select editor-select--small"
              value={viewModel.sortBy}
              onChange={(e) =>
                viewModel.setSortBy(
                  e.target.value as 'name' | 'date' | 'category',
                )
              }
            >
              <option value="date">Newest</option>
              <option value="name">Name</option>
              <option value="category">Category</option>
            </select>
            <button
              className="split-pane__add-btn split-pane__add-btn--secondary"
              onClick={() => viewModel.setShowImportModal(true)}
              disabled={viewModel.importPending}
            >
              {viewModel.importPending ? 'Importing…' : 'Import .md'}
            </button>
            <button
              className="split-pane__add-btn split-pane__add-btn--secondary"
              onClick={() => viewModel.navigateWithGuard('/skills')}
            >
              Open Skills
            </button>
          </>
        }
      >
        {viewModel.isEditing && (
          <PlaybooksEditor
            agents={viewModel.agents}
            categories={viewModel.categories}
            dirty={viewModel.dirty}
            form={viewModel.form}
            isNew={viewModel.isNew}
            selectedId={viewModel.selectedId}
            selectedPrompt={viewModel.selectedPrompt}
            savePending={viewModel.createPending || viewModel.updatePending}
            advancedOpen={viewModel.advancedOpen}
            touched={viewModel.touched}
            onAdvancedOpenChange={viewModel.setAdvancedOpen}
            onDelete={() => viewModel.setShowDeleteModal(true)}
            onDuplicate={viewModel.handleDuplicate}
            onExport={handleExport}
            onFieldBlur={viewModel.onFieldBlur}
            onFieldChange={viewModel.updateField}
            onGlobalChange={viewModel.onGlobalChange}
            onSave={viewModel.handleSave}
            onTest={() => viewModel.setShowRunModal(true)}
            onPackageAsSkill={viewModel.handlePackageAsSkill}
            onGenerateContent={(value) =>
              viewModel.updateField('content', value)
            }
            onGenerateDescription={(value) =>
              viewModel.updateField('description', value)
            }
          />
        )}
      </SplitPaneLayout>

      <PlaybooksModalStack
        agents={viewModel.agents}
        form={viewModel.form}
        isDeleteOpen={viewModel.showDeleteModal}
        isImportOpen={viewModel.showImportModal}
        isRunOpen={viewModel.showRunModal}
        selectedPrompt={viewModel.selectedPrompt}
        templateVars={viewModel.templateVars}
        onCancelDelete={() => viewModel.setShowDeleteModal(false)}
        onCancelImport={() => viewModel.setShowImportModal(false)}
        onCancelRun={() => viewModel.setShowRunModal(false)}
        onConfirmDelete={viewModel.confirmDelete}
        onImport={viewModel.handleImport}
        onRun={viewModel.handleRun}
      />

      <GuidanceConversionModal
        isOpen={viewModel.showConvertToSkillModal}
        title="Create Skill From Playbook"
        sourceName={viewModel.form.name}
        destinationLabel="Skill"
        confirmLabel="Create Skill"
        defaultName={viewModel.form.name}
        pending={viewModel.convertToSkillPending}
        notes={[
          'Body, description, tags, category, and scope are copied.',
          'The Playbook remains unchanged.',
          'The new Skill records this Playbook as its source.',
        ]}
        onCancel={() => viewModel.setShowConvertToSkillModal(false)}
        onConfirm={viewModel.confirmPackageAsSkill}
      />

      <DiscardModal />
    </div>
  );
}
