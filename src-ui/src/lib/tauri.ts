/**
 * Tauri integration utilities
 */

// Check if we're running in Tauri
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Open a URL in a new Tauri WebView window (bypasses X-Frame-Options)
export async function openResearchUrl(url: string, title: string): Promise<void> {
  if (!isTauriApp()) {
    // Fallback: open in new browser tab
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_research_url', { url, title });
  } catch (error) {
    console.error('Failed to open research URL in Tauri:', error);
    // Fallback: open in new browser tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
