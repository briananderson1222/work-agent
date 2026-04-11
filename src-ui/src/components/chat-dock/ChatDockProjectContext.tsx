import { GitBadge } from '../GitBadge';
import { splitWorkingDirectoryPath } from './chat-dock-utils';

interface ChatDockProjectContextProps {
  selectedProjectSlug: string | null;
  projectSlug: string;
  projectName: string | null;
  workingDirectory: string | null;
  codingLayoutSlug: string | null;
  gitStatus?: any;
  onSelectProject: (projectSlug: string) => void;
  onOpenLayout: (projectSlug: string, layoutSlug: string) => void;
}

export function ChatDockProjectContext({
  selectedProjectSlug,
  projectSlug,
  projectName,
  workingDirectory,
  codingLayoutSlug,
  gitStatus,
  onSelectProject,
  onOpenLayout,
}: ChatDockProjectContextProps) {
  const isCurrentProject = selectedProjectSlug === projectSlug;
  const { parentPath, leafName, hasWorkingDirectory } =
    splitWorkingDirectoryPath(workingDirectory);

  return (
    <div className="chat-dock__project-context">
      <span
        className={`chat-dock__project-badge${isCurrentProject ? '' : ' chat-dock__project-badge--link'}`}
        onClick={
          isCurrentProject
            ? undefined
            : () => onSelectProject(projectSlug)
        }
      >
        {projectName || projectSlug}
      </span>
      {hasWorkingDirectory && (
        <span
          className={`chat-dock__project-dir${codingLayoutSlug ? ' chat-dock__project-dir--link' : ''}`}
          onClick={
            codingLayoutSlug
              ? () => onOpenLayout(projectSlug, codingLayoutSlug)
              : undefined
          }
        >
          <span className="chat-dock__project-dir-parent">{parentPath}</span>
          <span className="chat-dock__project-dir-leaf">{leafName}</span>
        </span>
      )}
      {!hasWorkingDirectory && (
        <span className="chat-dock__project-dir chat-dock__project-dir--fallback">
          ~ (defaults to home)
        </span>
      )}
      {gitStatus && <GitBadge git={gitStatus} />}
    </div>
  );
}
