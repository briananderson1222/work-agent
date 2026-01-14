import { ComponentType, lazy, Suspense } from 'react';
import type { WorkspaceProps } from '@stallion-ai/sdk';

interface PluginLoaderProps {
  pluginPath: string;
  agentSlug: string;
}

export function PluginLoader({ pluginPath, agentSlug }: PluginLoaderProps) {
  const Component = lazy(() => import(`../plugins/${pluginPath}/index.tsx`)) as ComponentType<WorkspaceProps>;

  return (
    <Suspense fallback={<div>Loading plugin...</div>}>
      <Component agentSlug={agentSlug} />
    </Suspense>
  );
}
