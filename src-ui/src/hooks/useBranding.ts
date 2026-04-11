import { useBrandingQuery } from '@stallion-ai/sdk';

export function useBranding() {
  const { data, isLoading } = useBrandingQuery();
  return {
    appName: data?.appName ?? 'Stallion',
    logo: data?.logo ?? null,
    theme: data?.theme ?? null,
    welcomeMessage: data?.welcomeMessage ?? null,
    loading: isLoading,
  };
}
