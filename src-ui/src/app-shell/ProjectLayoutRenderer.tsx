import { useProjectLayoutQuery } from '@stallion-ai/sdk';
import { LayoutView } from '../views/LayoutView';
import { layoutTypeRegistry } from './layoutRegistry';

export function ProjectLayoutRenderer({
  projectSlug,
  layoutSlug,
}: {
  projectSlug: string;
  layoutSlug: string;
}) {
  const { data: layoutConfig } = useProjectLayoutQuery(projectSlug, layoutSlug);

  if (!layoutConfig) {
    return <LayoutView projectSlug={projectSlug} layoutSlug={layoutSlug} />;
  }

  const Renderer = layoutConfig.type
    ? layoutTypeRegistry[layoutConfig.type]
    : undefined;
  if (Renderer) {
    return (
      <Renderer
        projectSlug={projectSlug}
        layoutSlug={layoutSlug}
        config={layoutConfig.config ?? {}}
      />
    );
  }

  return <LayoutView projectSlug={projectSlug} layoutSlug={layoutSlug} />;
}
