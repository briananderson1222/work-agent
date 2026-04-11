import type { NavigationView } from '../../types';

export interface HeaderHelpPrompt {
  label: string;
  prompt: string;
}

export interface HeaderBreadcrumb {
  projectSlug: string;
  layoutSlug?: string;
}

export function getHelpPrompts(
  view?: NavigationView,
): HeaderHelpPrompt[] {
  const generic = [
    {
      label: 'What can you do?',
      prompt: 'What can you help me with? List your capabilities.',
    },
    {
      label: 'System health check',
      prompt:
        'Run a system health check and tell me if anything needs attention.',
    },
  ];

  if (!view) return generic;

  const contextual: HeaderHelpPrompt[] = [];

  switch (view.type) {
    case 'agents':
      contextual.push(
        {
          label: 'Create an agent for me',
          prompt: 'Help me create a new agent. Ask me what I need it to do.',
        },
        {
          label: 'What skills should I add?',
          prompt:
            'List available skills and recommend which ones to install based on common use cases.',
        },
      );
      break;
    case 'connections-tools':
      contextual.push(
        {
          label: 'Add an MCP server',
          prompt:
            'Help me add a new MCP tool server. What popular ones are available?',
        },
        {
          label: 'Browse the registry',
          prompt:
            'List available integrations from the registry and help me pick ones to install.',
        },
      );
      break;
    case 'skills':
      contextual.push({
        label: 'Install recommended skills',
        prompt:
          'What skills are available in the registry? Recommend the most useful ones and install them.',
      });
      break;
    case 'prompts':
      contextual.push({
        label: 'Create a prompt for me',
        prompt:
          'Help me create a useful prompt. Ask me what task I want to automate.',
      });
      break;
    case 'schedule':
      contextual.push({
        label: 'Schedule a recurring task',
        prompt:
          'Help me set up a scheduled job. Ask me what I want to run and when.',
      });
      break;
    case 'connections-providers':
      contextual.push({
        label: 'Configure a provider',
        prompt: 'Help me set up a new LLM provider connection.',
      });
      break;
  }

  return [...contextual, ...generic];
}

export function getHeaderBreadcrumb(
  view?: NavigationView,
): HeaderBreadcrumb | null {
  if (!view) return null;

  switch (view.type) {
    case 'layout':
      return {
        projectSlug: view.projectSlug,
        layoutSlug: view.layoutSlug,
      };
    default:
      return null;
  }
}
