import { useEffect, useState } from 'react';
import { Calendar } from './Calendar';
import { CRM } from './CRM';
import { Portfolio } from './Portfolio';
import { Today } from './Today';
import { SiftQueue } from './SiftQueue';
import { Newsletters } from './Newsletters';
import { SalesProvider } from './StallionContext';
import { ensureProviders } from './data/init';

function useProviders() {
  const [ready, setReady] = useState(() => ensureProviders());
  useEffect(() => {
    if (!ready) {
      const id = setInterval(() => {
        if (ensureProviders()) { setReady(true); clearInterval(id); }
      }, 100);
      return () => clearInterval(id);
    }
  }, [ready]);
  return ready;
}

function withContext(Component: React.ComponentType<any>) {
  return (props: any) => {
    const ready = useProviders();
    if (!ready) return null;
    return <SalesProvider><Component {...props} /></SalesProvider>;
  };
}

export const components = {
  'stallion-workspace-portfolio': withContext(Portfolio),
  'stallion-workspace-today': withContext(Today),
  'stallion-workspace-calendar': withContext(Calendar),
  'stallion-workspace-crm': withContext(CRM),
  'stallion-workspace-sift-queue': withContext(SiftQueue),
  'stallion-workspace-newsletters': withContext(Newsletters),
};

export { requiredProviders } from './data/providerTypes';
export type { ProviderTypeMap, ProviderType } from './data/providerTypes';

export default withContext(Portfolio);
