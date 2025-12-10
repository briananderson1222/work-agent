// Simple mock SDK hooks for stallion-workspace components
// These provide the minimal interface needed for the components to work

import { useState, useEffect } from 'react';
import { transformTool } from '@stallion-ai/sdk';

let cachedUserDetails: { alias: string; sfdcId: string } | null = null;

export function useUserDetails(agentSlug: string) {
  const [userDetails, setUserDetails] = useState<{ alias: string; sfdcId: string } | null>(cachedUserDetails);
  const [loading, setLoading] = useState(!cachedUserDetails);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (cachedUserDetails) return;

    const fetchUserDetails = async () => {
      try {
        const details = await transformTool(agentSlug, 'sat-sfdc_get_my_personal_details', {}, '(data) => data');
        cachedUserDetails = details;
        setUserDetails(details);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch user details'));
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, [agentSlug]);

  return { userDetails, loading, error };
}

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
