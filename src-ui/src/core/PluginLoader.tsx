import type { LayoutComponentProps } from '@stallion-ai/sdk';
import { type ComponentType, lazy, Suspense } from 'react';

interface PluginLoaderProps {
  pluginPath: string;
  agentSlug: string;
}

export function PluginLoader({ pluginPath, agentSlug }: PluginLoaderProps) {
  const Component = lazy(
    () => import(`../plugins/${pluginPath}/index.tsx`),
  ) as ComponentType<LayoutComponentProps>;

  return (
    <Suspense fallback={<div>Loading plugin...</div>}>
      <Component {...({ agentSlug } as any)} />
    </Suspense>
  );
}
