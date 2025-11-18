// Simple mock SDK hooks for stallion-workspace components
// These provide the minimal interface needed for the components to work

export function useAgents() {
  // Return a mock agents array
  return [
    {
      slug: 'stallion-workspace:work-agent',
      name: 'Work Agent',
      status: 'idle'
    }
  ];
}

export function useAgent(slug: string) {
  // Return a mock agent object
  return {
    slug,
    name: 'Work Agent',
    status: 'idle'
  };
}

export function useSendMessage() {
  return async (message: string, agentSlug: string) => {
    // Mock implementation - in real usage this would send to the agent
    console.log(`Sending message to ${agentSlug}:`, message);
    return { content: [], success: true };
  };
}

export function useNavigation() {
  return {
    setDockState: (open: boolean) => {
      console.log('Setting dock state:', open);
      // In real implementation, this would control the chat dock
    }
  };
}

export function useToast() {
  return {
    showToast: (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      console.log(`Toast (${type}):`, message);
      // In real implementation, this would show a toast notification
    }
  };
}
