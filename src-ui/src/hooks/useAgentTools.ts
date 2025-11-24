import { useState, useEffect } from 'react';
import { log } from '@/utils/logger';

interface ToolMapping {
  server?: string;
  toolName?: string;
  originalName?: string;
}

export function useAgentTools(apiBase: string, agentSlug: string | undefined) {
  const [toolMappings, setToolMappings] = useState<Record<string, ToolMapping>>({});

  useEffect(() => {
    if (!agentSlug) return;

    const fetchTools = async () => {
      try {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/tools`);
        const result = await response.json();
        
        if (result.success) {
          const mappings = result.data.reduce((acc: Record<string, ToolMapping>, tool: any) => {
            acc[tool.name] = {
              server: tool.server,
              toolName: tool.toolName,
              originalName: tool.originalName,
            };
            return acc;
          }, {});
          setToolMappings(mappings);
        }
      } catch (err) {
        log.api('Failed to fetch agent tools:', err);
      }
    };

    fetchTools();
  }, [apiBase, agentSlug]);

  return toolMappings;
}
