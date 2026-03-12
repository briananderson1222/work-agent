import { useEffect, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

interface BrandingData {
  appName: string;
  logo: { src: string; alt?: string } | null;
  theme: Record<string, string> | null;
  welcomeMessage: string | null;
  loading: boolean;
}

export function useBranding(): BrandingData {
  const { apiBase } = useApiBase();
  const [data, setData] = useState<BrandingData>({
    appName: 'Stallion',
    logo: null,
    theme: null,
    welcomeMessage: null,
    loading: true,
  });

  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/api/branding`)
      .then((r) => r.json())
      .then((b) =>
        setData({
          appName: b.name || 'Stallion',
          logo: b.logo,
          theme: b.theme,
          welcomeMessage: b.welcomeMessage,
          loading: false,
        }),
      )
      .catch(() => setData((d) => ({ ...d, loading: false })));
  }, [apiBase]);

  return data;
}
