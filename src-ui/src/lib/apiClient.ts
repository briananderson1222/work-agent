type AuthCallback = () => Promise<boolean>;

let authCallback: AuthCallback | null = null;

export function setAuthCallback(callback: AuthCallback) {
  authCallback = callback;
}

export async function apiRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    if (!authCallback) {
      throw new Error('Authentication required but no auth handler configured');
    }

    const success = await authCallback();
    if (!success) {
      throw new Error('Authentication failed');
    }

    // Retry the request
    const retryResponse = await fetch(url, options);
    if (!retryResponse.ok) {
      throw new Error(`Request failed: ${retryResponse.statusText}`);
    }
    return retryResponse.json();
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.statusText}`);
  }

  return response.json();
}
