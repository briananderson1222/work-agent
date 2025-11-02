# AWS Authentication Implementation

This document describes the AWS authentication flow implemented for handling 401/403 errors in the Tauri desktop app.

## Architecture

The implementation uses:
- **Tauri Shell Plugin** (`tauri-plugin-shell`) for executing `mwinit`
- **React hooks** for auth state management
- **API client wrapper** for automatic retry on auth errors
- **PIN dialog component** for user input

## Components

### 1. Rust Backend (`src-desktop/src/main.rs`)

Added `authenticate_aws` command that:
- Accepts a PIN as parameter
- Executes `mwinit -f` with PIN as environment variable
- Returns stdout on success or stderr on failure

```rust
#[tauri::command]
async fn authenticate_aws(app: tauri::AppHandle, pin: String) -> Result<String, String> {
    let shell = app.shell();
    let output = shell
        .command("mwinit")
        .args(["-f"])
        .env("MWINIT_PIN", pin)
        .output()
        .await
        .map_err(|e| format!("Failed to execute mwinit: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

### 2. Capabilities (`src-desktop/capabilities/default.json`)

Configured shell permissions to allow `mwinit` execution:

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "mwinit",
      "cmd": "mwinit",
      "args": ["-f"],
      "sidecar": false
    }
  ]
}
```

### 3. React Hook (`src-ui/src/hooks/useAwsAuth.ts`)

Provides auth state and invoke wrapper:

```typescript
export function useAwsAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = async (pin: string): Promise<boolean> => {
    setIsAuthenticating(true);
    setError(null);
    
    try {
      await invoke('authenticate_aws', { pin });
      return true;
    } catch (err) {
      setError(err as string);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  };

  return { authenticate, isAuthenticating, error };
}
```

### 4. API Client (`src-ui/src/lib/apiClient.ts`)

Wraps fetch with automatic auth retry:

```typescript
export async function apiRequest<T>(
  url: string,
  options?: RequestInit
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
```

### 5. PIN Dialog (`src-ui/src/components/PinDialog.tsx`)

Modal dialog for PIN entry with loading state and error display.

### 6. App Integration (`src-ui/src/App.tsx`)

- Sets up auth callback on mount
- Manages PIN dialog state
- Handles PIN submission and cancellation

## Usage

Replace existing `fetch()` calls with `apiRequest()`:

```typescript
// Before
const response = await fetch(`${API_BASE}/api/agents`);
const data = await response.json();

// After
const data = await apiRequest<{ data: any[] }>(`${API_BASE}/api/agents`);
```

The auth flow will automatically trigger when a 401/403 is encountered.

## Flow Diagram

```
API Request (401/403)
  ↓
Auth Callback Triggered
  ↓
Show PIN Dialog
  ↓
User Enters PIN
  ↓
Invoke authenticate_aws Command
  ↓
Execute mwinit -f (with PIN env var)
  ↓
Wait for Security Key Touch
  ↓
Success → Retry Original Request
Failure → Show Error in Dialog
```

## Next Steps

To complete the implementation:

1. Replace all `fetch()` calls in App.tsx with `apiRequest()`
2. Add TypeScript types for API responses
3. Test the flow with actual AWS credentials
4. Add retry limits to prevent infinite loops
5. Consider caching auth state to avoid repeated prompts
