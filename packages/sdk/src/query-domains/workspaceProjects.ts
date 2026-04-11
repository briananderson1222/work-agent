import { useMutation, useQueryClient } from '@tanstack/react-query';
import { _getApiBase, fetchAvailableLayouts } from '../api';
import { type MutationOptions, type QueryConfig, useApiMutation, useApiQuery } from '../query-core';

export interface AvailableProjectLayout {
  source: string;
  plugin?: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  type: string;
}

export function useProjectsQuery(config?: QueryConfig<any>) {
  return useApiQuery(
    ['projects'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    config,
  );
}

export function useProjectQuery(slug: string, config?: QueryConfig<any>) {
  return useApiQuery(
    ['projects', slug],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects/${slug}`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    { ...config, enabled: !!slug && (config?.enabled ?? true) },
  );
}

export function useProjectLayoutsQuery(
  projectSlug: string,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['projects', projectSlug, 'layouts'],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${projectSlug}/layouts`,
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    { ...config, enabled: !!projectSlug && (config?.enabled ?? true) },
  );
}

export function useProjectLayoutQuery(
  projectSlug: string | undefined,
  layoutSlug: string | undefined,
  config?: QueryConfig<any>,
) {
  return useApiQuery(
    ['projects', projectSlug ?? '', 'layouts', layoutSlug ?? ''],
    async () => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectSlug!)}/layouts/${encodeURIComponent(layoutSlug!)}`,
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    {
      ...config,
      enabled: !!projectSlug && !!layoutSlug && (config?.enabled ?? true),
    },
  );
}

export function useAvailableProjectLayoutsQuery(
  config?: QueryConfig<AvailableProjectLayout[]>,
) {
  return useApiQuery(
    ['projects', 'layouts', 'available'],
    async () => (await fetchAvailableLayouts()) as AvailableProjectLayout[],
    config,
  );
}

export function useDeleteProjectLayoutMutation(
  projectSlug: string,
  options?: MutationOptions<void, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (layoutSlug: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/layouts/${encodeURIComponent(layoutSlug)}`,
        { method: 'DELETE' },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete layout');
      }
    },
    onSuccess: (_, layoutSlug) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectSlug, 'layouts'],
      });
      options?.onSuccess?.(undefined, layoutSlug);
    },
    onError: (error, layoutSlug) => {
      options?.onError?.(error as Error, layoutSlug);
    },
  });
}

export function useCreateProjectMutation() {
  return useApiMutation(
    async (data: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      workingDirectory?: string;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    { invalidateKeys: [['projects']] },
  );
}

export function useCreateProjectLayoutMutation(
  options?: MutationOptions<
    any,
    {
      projectSlug: string;
      name: string;
      slug: string;
      type: string;
      icon?: string;
      description?: string;
      config?: Record<string, unknown>;
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectSlug,
      ...data
    }: {
      projectSlug: string;
      name: string;
      slug: string;
      type: string;
      icon?: string;
      description?: string;
      config?: Record<string, unknown>;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectSlug)}/layouts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.projectSlug, 'layouts'],
      });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}

export function useUpdateProjectMutation(
  options?: MutationOptions<any, { slug: string; [key: string]: any }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, ...data }: { slug: string; [key: string]: any }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', variables.slug] });
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options?.onError?.(error as Error, variables);
    },
  });
}

export function useDeleteProjectMutation(
  options?: MutationOptions<any, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const apiBase = await _getApiBase();
      const response = await fetch(`${apiBase}/api/projects/${slug}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data, slug) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.removeQueries({ queryKey: ['projects', slug] });
      options?.onSuccess?.(data, slug);
    },
    onError: (error, slug) => {
      options?.onError?.(error as Error, slug);
    },
  });
}

export function useCreateLayoutMutation(projectSlug: string) {
  return useApiMutation(
    async (data: {
      name: string;
      slug: string;
      type: string;
      icon?: string;
      description?: string;
      config?: Record<string, unknown>;
    }) => {
      const apiBase = await _getApiBase();
      const response = await fetch(
        `${apiBase}/api/projects/${projectSlug}/layouts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    { invalidateKeys: [['projects', projectSlug, 'layouts']] },
  );
}
