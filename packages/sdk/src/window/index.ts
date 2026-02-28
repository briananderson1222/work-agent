import type { WindowOptions } from '../types';

export class WindowAPI {
  async open(options: WindowOptions): Promise<void> {
    // Try Tauri first if available
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      new WebviewWindow(options.title || 'Window', {
        url: options.url,
        width: options.width,
        height: options.height,
      });
    } else {
      // Fallback to browser window
      window.open(
        options.url,
        options.title || '_blank',
        `width=${options.width || 800},height=${options.height || 600}`,
      );
    }
  }
}
