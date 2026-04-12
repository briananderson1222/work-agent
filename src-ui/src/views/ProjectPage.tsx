import {
  fetchAvailableLayouts,
  useAddLayoutFromPluginMutation,
  useCreateLayoutMutation,
  useKnowledgeDocsQuery,
  useKnowledgeNamespacesQuery,
  useKnowledgeStatusQuery,
  useProjectConversationsQuery,
  useProjectLayoutsQuery,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@stallion-ai/sdk';
import { useEffect, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useGitLog, useGitStatus } from '../hooks/useGitStatus';
import { ProjectConversationsSection } from './project-page/ProjectConversationsSection';
import { ProjectKnowledgeSection } from './project-page/ProjectKnowledgeSection';
import {
  ProjectAddLayoutModal,
  ProjectLayoutsSection,
} from './project-page/ProjectLayoutsSection';
import { ProjectPageHeader } from './project-page/ProjectPageHeader';
import type { AvailableLayout, ConversationRecord } from './project-page/types';
import './ProjectPage.css';

export function ProjectPage({ slug }: { slug: string }) {
  const { apiBase } = useApiBase();
  const { setLayout, setConversation, navigate } = useNavigation();

  const { data: project, isLoading } = useProjectQuery(slug);
  const { data: layouts = [] } = useProjectLayoutsQuery(slug);
  const { data: gitStatus } = useGitStatus(project?.workingDirectory);
  const { data: gitLog = [] } = useGitLog(project?.workingDirectory, 5);
  const { data: docs = [] } = useKnowledgeDocsQuery(slug);
  const { data: knowledgeStatus } = useKnowledgeStatusQuery(slug);
  const { data: namespaces = [] } = useKnowledgeNamespacesQuery(slug);
  const { data: conversations = [] } = useProjectConversationsQuery(slug);

  const [editingDir, setEditingDir] = useState(false);
  const [dirDraft, setDirDraft] = useState('');
  const [showAddLayout, setShowAddLayout] = useState(false);
  const [available, setAvailable] = useState<AvailableLayout[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  const updateProjectMutation = useUpdateProjectMutation();
  const addLayoutFromPluginMutation = useAddLayoutFromPluginMutation(slug);
  const createLayoutMutation = useCreateLayoutMutation(slug);

  useEffect(() => {
    if (!showAddLayout) {
      return;
    }
    fetchAvailableLayouts()
      .then((data) => setAvailable(data))
      .catch(() => {});
  }, [showAddLayout]);

  async function addLayout(item: AvailableLayout) {
    setAdding(item.slug);
    try {
      if (item.source === 'plugin' && item.plugin) {
        await addLayoutFromPluginMutation.mutateAsync(item.plugin);
      } else {
        await createLayoutMutation.mutateAsync({
          type: item.type,
          name: item.name,
          slug: `${item.slug}-${Date.now().toString(36)}`,
          icon: item.icon,
          description: item.description,
          config: {},
        });
      }
      setShowAddLayout(false);
    } catch {
      // ignore
    }
    setAdding(null);
  }

  function updateWorkingDirectory(value: string) {
    updateProjectMutation.mutate(
      { slug, workingDirectory: value || undefined },
      { onSuccess: () => setEditingDir(false) },
    );
  }

  function handleConversationClick(conversation: ConversationRecord) {
    const layoutSlug = conversation.layoutId || (layouts as any[])[0]?.slug;
    if (layoutSlug) {
      setLayout(slug, layoutSlug);
      setTimeout(() => setConversation(conversation.id), 100);
    }
  }

  if (isLoading || !project) {
    return (
      <div className="project-page">
        <div className="project-page__inner project-page__loading">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="project-page">
      <div className="project-page__inner">
        <ProjectPageHeader
          apiBase={apiBase}
          project={project}
          gitStatus={gitStatus}
          editingDir={editingDir}
          setEditingDir={setEditingDir}
          dirDraft={dirDraft}
          setDirDraft={setDirDraft}
          updateWorkingDirectory={updateWorkingDirectory}
          navigateToSettings={() => navigate(`/projects/${slug}/edit`)}
        />

        {gitStatus && (
          <div className="project-page__git-section">
            <div className="project-page__section-header">
              <span className="project-page__section-label">
                ⎇ {gitStatus.branch}
                {gitStatus.changes.length > 0 && (
                  <span className="project-page__git-section-dirty">
                    {' '}
                    · {gitStatus.staged} staged, {gitStatus.unstaged} modified,{' '}
                    {gitStatus.untracked} untracked
                  </span>
                )}
                {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
                  <span className="project-page__git-section-remote">
                    {gitStatus.ahead > 0 && ` · ↑${gitStatus.ahead}`}
                    {gitStatus.behind > 0 && ` · ↓${gitStatus.behind}`}
                  </span>
                )}
              </span>
            </div>
            {gitLog.length > 0 && (
              <div className="project-page__git-log">
                {gitLog.map((commit) => (
                  <div key={commit.sha} className="project-page__git-commit">
                    <span className="project-page__git-sha">{commit.sha}</span>
                    <span className="project-page__git-msg">
                      {commit.message}
                    </span>
                    <span className="project-page__git-meta">
                      {commit.author} · {commit.relativeTime}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ProjectLayoutsSection
          slug={slug}
          layouts={layouts as any[]}
          setLayout={setLayout}
          onOpenAddLayout={() => setShowAddLayout(true)}
        />

        <ProjectKnowledgeSection
          apiBase={apiBase}
          slug={slug}
          projectWorkingDirectory={project.workingDirectory}
          docs={docs}
          namespaces={namespaces}
          knowledgeStatus={knowledgeStatus}
        />

        <ProjectConversationsSection
          conversations={conversations as ConversationRecord[]}
          onConversationClick={handleConversationClick}
        />

        <ProjectAddLayoutModal
          show={showAddLayout}
          available={available}
          adding={adding}
          onClose={() => setShowAddLayout(false)}
          onAddLayout={addLayout}
        />
      </div>
    </div>
  );
}
