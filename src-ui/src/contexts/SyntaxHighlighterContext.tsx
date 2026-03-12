/**
 * Core syntax highlighting provider — Shiki-based, lazy-loaded, cached.
 *
 * Consumed by:
 *   - CodingLayout file previewer
 *   - Chat markdown code blocks (MessageBubble, StreamingMessage)
 *   - Any future component needing syntax highlighting
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ── Interface ─────────────────────────────────────────────────────

export interface ISyntaxHighlighter {
  highlight(code: string, lang?: string): string;
  readonly ready: boolean;
  readonly loadedLanguages: string[];
}

// ── LRU Cache ─────────────────────────────────────────────────────

class HighlightCache {
  private map = new Map<string, string>();
  private maxEntries: number;

  constructor(maxEntries = 300) {
    this.maxEntries = maxEntries;
  }

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: string) {
    if (this.map.size >= this.maxEntries) {
      // Evict oldest
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, value);
  }
}

// ── Shiki singleton ───────────────────────────────────────────────

type ShikiHighlighter = Awaited<
  ReturnType<typeof import('shiki')['createHighlighter']>
>;

let shikiInstance: ShikiHighlighter | null = null;
let shikiLoading = false;
const shikiWaiters: Array<(h: ShikiHighlighter) => void> = [];

const PRELOAD_LANGS = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'html',
  'css',
  'python',
  'rust',
  'go',
  'java',
  'bash',
  'yaml',
  'toml',
  'sql',
  'markdown',
  'xml',
  'dockerfile',
] as const;

const THEME = 'github-dark';

async function initShiki(): Promise<ShikiHighlighter> {
  if (shikiInstance) return shikiInstance;
  if (shikiLoading) {
    return new Promise<ShikiHighlighter>((resolve) =>
      shikiWaiters.push(resolve),
    );
  }
  shikiLoading = true;
  const { createHighlighter } = await import('shiki');
  shikiInstance = await createHighlighter({
    themes: [THEME],
    langs: [...PRELOAD_LANGS],
  });
  shikiLoading = false;
  for (const w of shikiWaiters) w(shikiInstance);
  shikiWaiters.length = 0;
  return shikiInstance;
}

// ── File extension → language mapping ─────────────────────────────

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown',
  mdx: 'markdown',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  xml: 'xml',
  svg: 'xml',
  dockerfile: 'dockerfile',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
};

export function langFromFilePath(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  // Handle "Dockerfile" with no extension
  if (path.toLowerCase().endsWith('dockerfile')) return 'dockerfile';
  return EXT_LANG[ext];
}

// ── Shiki implementation ──────────────────────────────────────────

class ShikiSyntaxHighlighter implements ISyntaxHighlighter {
  private cache = new HighlightCache();
  private highlighter: ShikiHighlighter | null = null;

  get ready() {
    return this.highlighter !== null;
  }
  get loadedLanguages() {
    return this.highlighter?.getLoadedLanguages() ?? [];
  }

  setHighlighter(h: ShikiHighlighter) {
    this.highlighter = h;
  }

  highlight(code: string, lang?: string): string {
    if (!this.highlighter) return escapeHtml(code);

    const resolvedLang =
      lang && this.highlighter.getLoadedLanguages().includes(lang)
        ? lang
        : 'text';
    const cacheKey = `${resolvedLang}:${fnv1a(code)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const html = this.highlighter.codeToHtml(code, {
        lang: resolvedLang,
        theme: THEME,
      });
      this.cache.set(cacheKey, html);
      return html;
    } catch {
      const fallback = `<pre style="background:#0d1117;color:#e6edf3;padding:12px;border-radius:6px;overflow-x:auto"><code>${escapeHtml(code)}</code></pre>`;
      this.cache.set(cacheKey, fallback);
      return fallback;
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

// ── React Context ─────────────────────────────────────────────────

const SyntaxHighlighterContext = createContext<ISyntaxHighlighter | null>(null);

export function SyntaxHighlighterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [_ready, setReady] = useState(!!shikiInstance);
  const implRef = useRef(new ShikiSyntaxHighlighter());

  useEffect(() => {
    if (shikiInstance) {
      implRef.current.setHighlighter(shikiInstance);
      setReady(true);
      return;
    }
    let cancelled = false;
    initShiki().then((h) => {
      if (cancelled) return;
      implRef.current.setHighlighter(h);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Force re-render when ready changes so consumers see updated `ready`
  const value = useMemo(() => implRef.current, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SyntaxHighlighterContext.Provider value={value}>
      {children}
    </SyntaxHighlighterContext.Provider>
  );
}

export function useSyntaxHighlighter(): ISyntaxHighlighter {
  const ctx = useContext(SyntaxHighlighterContext);
  if (!ctx)
    throw new Error(
      'useSyntaxHighlighter must be used within SyntaxHighlighterProvider',
    );
  return ctx;
}
