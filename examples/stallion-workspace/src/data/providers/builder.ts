import { transformTool } from '@stallion-ai/sdk';
import type { IInternalProvider } from '../providers';
import type { PersonVM } from '../viewmodels';

const AGENT = 'work-agent';

function mapPerson(raw: any, fallbackAlias?: string): PersonVM {
  return {
    alias: raw.alias || raw.login || fallbackAlias || '',
    name: raw.name || raw.displayName || fallbackAlias || '',
    title: raw.jobTitle || raw.title,
    team: raw.team || raw.department,
    manager: raw.manager?.name || raw.manager,
    location: raw.location || raw.building,
    email: raw.email || (fallbackAlias ? `${fallbackAlias}@amazon.com` : undefined),
  };
}

export const builderProvider: IInternalProvider = {
  async lookupPerson(alias) {
    try {
      const r = await transformTool(AGENT, 'builder-mcp_ReadInternalWebsites', { url: `https://phonetool.amazon.com/users/${alias}` }, 'data => data');
      return mapPerson(r, alias);
    } catch {
      return { alias, name: alias, email: `${alias}@amazon.com` };
    }
  },
  async searchPeople(query) {
    try {
      const r = await transformTool(AGENT, 'builder-mcp_ReadInternalWebsites', { url: `https://phonetool.amazon.com/search?query=${encodeURIComponent(query)}` }, 'data => data');
      return Array.isArray(r) ? r.map(p => mapPerson(p)) : [];
    } catch {
      return [];
    }
  },
};