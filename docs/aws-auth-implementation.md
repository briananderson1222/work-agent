# Authentication Implementation

This document describes the pluggable authentication architecture.

## Architecture

Authentication is handled through provider interfaces that can be registered by plugins:

- **IAuthProvider** — Handles auth status checking, renewal, and badge photos
- **IUserIdentityProvider** — Provides user identity (alias, name, email, etc.)
- **IUserDirectoryProvider** — Provides user lookup and search

## Default Behavior (No Plugin)

Without any auth plugin installed:
- Auth status is always `valid` with provider `none`
- User identity is the OS username
- User directory returns stub data (alias only)

## Plugin-Provided Auth

Plugins can register providers via `plugin.json`:

```json
{
  "providers": [
    { "type": "auth", "module": "./providers/my-auth.js" },
    { "type": "userIdentity", "module": "./providers/my-user.js" },
    { "type": "userDirectory", "module": "./providers/my-directory.js" }
  ]
}
```

Provider modules export a factory function that returns the provider instance.

## Desktop App (Tauri)

The desktop app supports external authentication via the `AUTH_COMMAND` environment variable:

1. Set `AUTH_COMMAND` to your authentication command
2. The `authenticate_external` Tauri command pipes the PIN to the auth command
3. If `AUTH_COMMAND` is not set, desktop auth returns an error

## API Endpoints

- `GET /api/auth/status` — Auth status + user identity
- `POST /api/auth/renew` — Trigger auth renewal
- `GET /api/auth/badge-photo/:id` — Badge photo proxy (if provider supports it)
- `GET /api/users/:alias` — User directory lookup
- `GET /api/users/search?q=...` — User directory search

## Flow

```
API Request (401/403)
  ↓
Auth Callback Triggered
  ↓
Show PIN Dialog (desktop) or Renew Button (web)
  ↓
Provider handles renewal
  ↓
Success → Retry Original Request
Failure → Show Error
```
