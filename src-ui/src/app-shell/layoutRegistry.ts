import type { ComponentType } from 'react';
import { CodingLayout } from '../components/CodingLayout';

type LayoutTypeComponent = ComponentType<{
  projectSlug: string;
  layoutSlug: string;
  config: Record<string, unknown>;
}>;

export const layoutTypeRegistry: Record<string, LayoutTypeComponent> = {
  coding: CodingLayout,
};
