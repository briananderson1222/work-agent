import { useRef, useEffect, useState, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';

interface ShadowContainerProps {
  cssUrl?: string;
  children: ReactNode;
}

/**
 * Renders children inside a Shadow DOM root with isolated CSS.
 * CSS custom properties from :root inherit through the shadow boundary,
 * so the core theme still applies.
 */
export function ShadowContainer({ cssUrl, children }: ShadowContainerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ReturnType<typeof ReactDOM.createRoot> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hostRef.current || shadowRef.current) return;

    const shadow = hostRef.current.attachShadow({ mode: 'open' });
    shadowRef.current = shadow;

    // Inject plugin CSS into shadow root
    if (cssUrl) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
      shadow.appendChild(link);
    }

    // Create mount point
    const mount = document.createElement('div');
    mount.style.height = '100%';
    shadow.appendChild(mount);
    mountRef.current = mount;

    setReady(true);

    return () => {
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null;
      }
    };
  }, [cssUrl]);

  useEffect(() => {
    if (!ready || !mountRef.current) return;

    if (!rootRef.current) {
      rootRef.current = ReactDOM.createRoot(mountRef.current);
    }
    rootRef.current.render(children);
  }, [ready, children]);

  return <div ref={hostRef} style={{ height: '100%', display: 'contents' }} />;
}
