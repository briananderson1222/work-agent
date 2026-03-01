/**
 * useShareReceiver — handles incoming share intents from the OS share sheet.
 *
 * On Android, when the user shares text/URL from another app to Stallion:
 *   - Tauri's deep-link plugin (or a custom plugin) sets `window.__SHARE_TEXT__`
 *     before React hydrates, OR dispatches a custom event 'stallion:share-received'.
 *   - We also check `?share=<encoded>` URL parameters (useful for web/PWA mode).
 *
 * The caller provides an `onShare(text)` callback to pre-fill the chat input.
 *
 * Android manifest setup (required in src-desktop/gen/android/.../AndroidManifest.xml):
 * ```xml
 * <intent-filter>
 *   <action android:name="android.intent.action.SEND" />
 *   <category android:name="android.intent.category.DEFAULT" />
 *   <data android:mimeType="text/plain" />
 * </intent-filter>
 * ```
 *
 * Tauri plugin setup (src-desktop/src/lib.rs):
 * Use `tauri-plugin-deep-link` or handle the intent in MainActivity.kt and
 * call `window.__SHARE_TEXT__ = "<shared text>"` via WebView.evaluateJavascript.
 */
import { useEffect } from 'react';

interface UseShareReceiverOptions {
  /** Whether to watch for incoming shares. */
  enabled: boolean;
  /** Called with the shared text/URL when a share intent arrives. */
  onShare: (text: string) => void;
}

export function useShareReceiver({
  enabled,
  onShare,
}: UseShareReceiverOptions): void {
  useEffect(() => {
    if (!enabled) return;

    // 1. Check for native-layer pre-set value (Tauri/WebView injection)
    const nativeShared = (window as any).__SHARE_TEXT__ as string | undefined;
    if (nativeShared) {
      delete (window as any).__SHARE_TEXT__;
      onShare(nativeShared);
      return;
    }

    // 2. Check URL search params (PWA / web share target)
    const params = new URLSearchParams(window.location.search);
    const urlShare =
      params.get('share') ??
      params.get('text') ??
      params.get('url') ??
      params.get('title');
    if (urlShare) {
      // Clean the parameter from the URL without reloading
      params.delete('share');
      params.delete('text');
      params.delete('url');
      params.delete('title');
      const clean =
        window.location.pathname +
        (params.toString() ? '?' + params.toString() : '') +
        window.location.hash;
      window.history.replaceState(null, '', clean);
      onShare(decodeURIComponent(urlShare));
      return;
    }

    // 3. Listen for runtime events (Tauri events while app is already open)
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) onShare(text);
    };
    window.addEventListener('stallion:share-received', handler);
    return () => window.removeEventListener('stallion:share-received', handler);
  }, [enabled, onShare]); // eslint-disable-line react-hooks/exhaustive-deps
}
