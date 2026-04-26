import type { NavigationView } from '../types';

export function resolveViewFromPath(
  path: string,
  options?: {
    lastProject?: string | null;
    lastProjectLayout?: string | null;
  },
): NavigationView {
  const lastProject = options?.lastProject ?? null;
  const lastProjectLayout = options?.lastProjectLayout ?? null;

  if (path === '/agents' || path.startsWith('/agents/')) {
    if (path === '/agents/new') {
      return { type: 'agent-new' };
    }
    if (path.endsWith('/edit')) {
      const slug = path.split('/')[2];
      return { type: 'agent-edit', slug };
    }
    if (path.endsWith('/tools')) {
      const slug = path.split('/')[2];
      return { type: 'agent-tools', slug };
    }
    if (path.endsWith('/workflows')) {
      const slug = path.split('/')[2];
      return { type: 'workflows', slug };
    }
    if (path !== '/agents') {
      const slug = path.split('/')[2];
      if (slug) {
        return { type: 'agent-edit', slug };
      }
    }
    return { type: 'agents' };
  }

  if (path === '/prompts' || path.startsWith('/prompts/')) {
    return { type: 'playbooks' };
  }
  if (path === '/playbooks' || path.startsWith('/playbooks/')) {
    return { type: 'playbooks' };
  }
  if (path === '/skills' || path.startsWith('/skills/')) {
    return { type: 'skills' };
  }
  if (path === '/registry' || path.startsWith('/registry/')) {
    return { type: 'registry' };
  }
  if (path === '/plugins' || path.startsWith('/plugins/')) {
    return { type: 'plugins' };
  }
  if (path === '/connections') {
    return { type: 'connections' };
  }
  if (path === '/connections/providers') {
    return { type: 'connections-providers' };
  }
  if (path.startsWith('/connections/providers/')) {
    const id = path.split('/')[3];
    if (id) {
      return { type: 'connections-provider-edit', id };
    }
  }
  if (path.startsWith('/connections/runtimes/')) {
    const id = path.split('/')[3];
    if (id) {
      return { type: 'connections-runtime-edit', id };
    }
  }
  if (path === '/connections/runtimes') {
    return { type: 'connections-runtimes' };
  }
  if (path === '/connections/acp') {
    return { type: 'connections-acp' };
  }
  if (path === '/connections/tools') {
    return { type: 'connections-tools' };
  }
  if (path.startsWith('/connections/tools/')) {
    const id = path.split('/')[3];
    if (id) {
      return { type: 'connections-tool-edit', id };
    }
  }
  if (path === '/connections/knowledge') {
    return { type: 'connections-knowledge' };
  }
  if (path === '/integrations' || path.startsWith('/integrations/')) {
    return { type: 'connections-tools' };
  }
  if (path === '/providers') {
    return { type: 'connections-providers' };
  }
  if (path.startsWith('/providers/')) {
    const id = path.split('/')[2];
    if (id) {
      return { type: 'connections-provider-edit', id };
    }
  }
  if (path === '/monitoring') {
    return { type: 'monitoring' };
  }
  if (path === '/schedule') {
    return { type: 'schedule' };
  }
  if (path === '/settings') {
    return { type: 'settings' };
  }
  if (path === '/profile') {
    return { type: 'profile' };
  }
  if (path === '/notifications') {
    return { type: 'notifications' };
  }
  if (path === '/manage') {
    return { type: 'agents' };
  }
  if (path.startsWith('/manage/agents')) {
    return { type: 'agents' };
  }
  if (path.startsWith('/manage/prompts')) {
    return { type: 'playbooks' };
  }
  if (path.startsWith('/manage/plugins')) {
    return { type: 'plugins' };
  }
  if (path.startsWith('/manage/integrations')) {
    return { type: 'connections-tools' };
  }
  if (path.startsWith('/manage/providers')) {
    return { type: 'connections-providers' };
  }
  if (path === '/tools') {
    return { type: 'connections-tools' };
  }
  if (path === '/sys/monitoring') {
    return { type: 'monitoring' };
  }
  if (path === '/sys/schedule') {
    return { type: 'schedule' };
  }
  if (path === '/projects/new') {
    return { type: 'project-new' };
  }
  if (path.startsWith('/projects/') && path.endsWith('/edit')) {
    const slug = path.split('/')[2];
    return { type: 'project-edit', slug };
  }
  if (path.match(/^\/projects\/[^/]+\/layouts\/[^/]+/)) {
    const parts = path.split('/');
    return { type: 'layout', projectSlug: parts[2], layoutSlug: parts[4] };
  }
  if (path.startsWith('/projects/')) {
    const slug = path.split('/')[2];
    if (slug) {
      return { type: 'project', slug };
    }
  }

  if (lastProject && lastProjectLayout) {
    return {
      type: 'layout',
      projectSlug: lastProject,
      layoutSlug: lastProjectLayout,
    };
  }
  if (lastProject) {
    return { type: 'project', slug: lastProject };
  }
  return { type: 'project-new' };
}

export function getPathForView(view: NavigationView): string | null {
  switch (view.type) {
    case 'agents':
      return '/agents';
    case 'prompts':
      return '/prompts';
    case 'skills':
      return '/skills';
    case 'playbooks':
      return '/playbooks';
    case 'plugins':
      return '/plugins';
    case 'connections':
      return '/connections';
    case 'connections-providers':
      return '/connections/providers';
    case 'connections-provider-edit':
      return `/connections/providers/${view.id}`;
    case 'connections-runtimes':
      return '/connections/runtimes';
    case 'connections-runtime-edit':
      return `/connections/runtimes/${view.id}`;
    case 'connections-acp':
      return '/connections/acp';
    case 'connections-tools':
      return '/connections/tools';
    case 'connections-tool-edit':
      return `/connections/tools/${view.id}`;
    case 'connections-knowledge':
      return '/connections/knowledge';
    case 'profile':
      return '/profile';
    case 'notifications':
      return '/notifications';
    case 'settings':
      return '/settings';
    case 'monitoring':
      return '/monitoring';
    case 'schedule':
      return '/schedule';
    case 'agent-new':
      return '/agents/new';
    case 'agent-edit':
    case 'agent-detail':
      return `/agents/${view.slug}`;
    case 'agent-tools':
      return `/agents/${view.slug}/tools`;
    case 'workflows':
      return `/agents/${view.slug}/workflows`;
    case 'project-new':
      return '/projects/new';
    case 'project-edit':
      return `/projects/${view.slug}/edit`;
    case 'project':
      return `/projects/${view.slug}`;
    case 'layout':
      return `/projects/${view.projectSlug}/layouts/${view.layoutSlug}`;
    default:
      return null;
  }
}
