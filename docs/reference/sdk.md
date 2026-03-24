# @stallion-ai/sdk

Primary reference for plugin developers. All imports come from `'@stallion-ai/sdk'`.

The SDK wraps core app contexts and exposes them through stable React hooks, UI components, typed API functions, and extension registries. Plugins never import from internal app packages directly.

---

## Setup

Plugins are automatically wrapped in `SDKProvider` by the runtime. No manual setup required. For layout plugins, use `LayoutProvider` instead — it also sets the layout context for agent resolution.

```tsx
// Core app wraps your plugin automatically:
<SDKProvider value={sdkContextValue}>
  <YourPlugin />
</SDKProvider>

// Workspace plugins use LayoutProvider:
<LayoutProvider sdk={sdkContextValue} layout={layoutConfig}>
  <YourWorkspacePlugin />
</LayoutProvider>
```

---

## Hooks

All hooks must be called inside a component tree wrapped by `SDKProvider`.

### Agent Hooks

#### `useAgents(): AgentSummary[]`

Returns all available agents.

```tsx
const agents = useAgents();
const myAgent = agents.find(a => a.slug === 'my-agent');
```

#### `useAgent(slug: string): AgentSummary | undefined`

Returns a single agent by slug.

```tsx
const agent = useAgent('my-agent');
```

#### `useResolveAgent(agentSlug: string): string`

Resolves a short agent name to a fully-qualified slug using the current layout context. Returns the slug unchanged if it already contains `:`.

```tsx
const resolved = useResolveAgent('my-agent'); // → 'sa-agent:my-agent'
```

---

### Layout Hooks

#### `useLayouts(): LayoutConfig[]`

Returns all layouts.

---

### Project Hooks

#### `useProjects(): Project[]`

Returns all projects.

#### `useProject(slug: string): Project | undefined`

Returns a single project by slug.

---

### Conversation Hooks

#### `useConversations(agentSlug?: string): Conversation[]`

Returns conversations, optionally filtered by agent.

#### `useConversation(conversationId: string): Conversation | undefined`

Returns a single conversation.

#### `useConversationMessages(conversationId: string): Message[]`

Returns messages for a conversation.

---

### Chat Hooks

#### `useCreateChatSession(): (agentSlug: string, name: string) => string`

Returns a function that creates a new chat session. Returns the session ID.

```tsx
const createSession = useCreateChatSession();
const sessionId = createSession('my-agent', 'My Agent');
```

#### `useOpenConversation(): (conversationId: string) => string`

Returns a function that opens an existing conversation in the chat dock. Returns the session ID.

#### `useSendMessage(): (sessionId: string, agentSlug: string, conversationId: string | undefined, message: string) => void`

Returns a function to send a message to an active chat session.

#### `useActiveChatActions(sessionId: string)`

Returns actions for a specific chat session (stop, clear, etc.).

#### `useActiveChatState(sessionId: string)`

Returns the current state of a specific chat session (loading, messages, etc.).

#### `useSendToChat(agentSlug: string): (message: string) => void`

Convenience hook. Returns a function that creates a session, opens the dock, and sends a message — all in one call. Resolves short agent names via layout context.

```tsx
const sendToChat = useSendToChat('my-agent');
sendToChat('Summarize this account');
```

---

### Navigation Hooks

#### `useNavigation(): NavigationState & { setDockState, setActiveChat, selectedWorkspace, ... }`

Returns the full navigation state and setters.

#### `useDockState(): { isOpen: boolean; setOpen: (v: boolean) => void; toggle: () => void }`

Convenience wrapper around `useNavigation()` for controlling the chat dock.

```tsx
const { isOpen, toggle } = useDockState();
```

---

### Auth & Config Hooks

#### `useAuth()`

Returns the current auth state.

```ts
{
  status: 'authenticated' | 'unauthenticated' | 'missing';
  user: { id: string; name: string; email: string } | null;
  expiresAt: number | null;
  provider: string;
  renew: () => Promise<void>;
  isRenewing: boolean;
}
```

#### `useConfig(): AppConfig`

Returns the full app configuration.

#### `useApiBase(): string`

Returns the current API base URL.

---

### Model Hooks

#### `useModels(): Model[]`

Returns all configured models.

#### `useAvailableModels(): Model[]`

Returns models available for the current user/layout.

---

### Knowledge Hooks

#### `useKnowledgeDocs(projectSlug: string, namespace?: string): KnowledgeDoc[]`

Returns knowledge documents for a project, optionally filtered by namespace.

#### `useKnowledgeNamespaces(projectSlug: string): KnowledgeNamespace[]`

Returns knowledge namespaces for a project.

#### `useKnowledgeSearch(projectSlug: string, query: string, namespace?: string): SearchResult[]`

Returns semantic search results from a project's knowledge base.

---

### Notification Hooks

#### `useToast()`

Returns `{ showToast(message, type, duration?) }`. Types: `'info' | 'success' | 'warning' | 'error'`.

#### `useNotifications()`

Higher-level wrapper over `useToast`.

```ts
{ notify: (message: string, options?: { type?, duration? }) => void }
```

```tsx
const { notify } = useNotifications();
notify('Saved!', { type: 'success' });
```

---

### Slash Command Hooks

#### `useSlashCommands(): SlashCommand[]`

Returns all registered slash commands.

#### `useSlashCommandHandler()`

Returns the handler function for processing slash command input.

---

### Tool Approval Hook

#### `useToolApproval()`

Returns the tool approval state and actions (approve/reject pending tool calls).

---

### Stats Hooks

#### `useStats()`

Returns aggregate usage statistics.

#### `useConversationStats(conversationId?: string)`

Returns stats for a specific conversation.

---

### Keyboard Hooks

#### `useKeyboardShortcut(key: string, callback: () => void, deps?: any[]): void`

Registers a keyboard shortcut for the lifetime of the component.

```tsx
useKeyboardShortcut('cmd+k', () => setOpen(true));
```

#### `useKeyboardShortcuts()`

Returns all registered keyboard shortcuts.

---

### Workflow Hooks

#### `useWorkflows(agentSlug?: string): Workflow[]`

Returns workflows, optionally filtered by agent.

#### `useWorkflowFiles(agentSlug: string): WorkflowFile[]`

Returns workflow files for an agent.

---

### Utility Hooks

#### `useSDK(): { apiBase: string }`

Returns raw SDK context. Prefer specific hooks over this.

#### `useUserLookup(alias: string | null): { data: any; loading: boolean; error: string | null }`

Looks up a user by alias via the user directory. Returns `null` data when alias is `null`.

```tsx
const { data, loading } = useUserLookup('jsmith');
```

#### `useServerFetch(): (url: string, options?) => Promise<{ status, contentType, body }>`

Routes an HTTP request through the backend to avoid CORS. Requires `network.fetch` permission in `plugin.json`.

```tsx
const serverFetch = useServerFetch();
const result = await serverFetch('https://api.example.com/data');
```

---

## Query Hooks

React Query wrappers. Use these instead of raw `useQuery` — they handle cache keys, stale times, and API base resolution automatically.

### `useAgentsQuery(config?)`

Fetches all agents. Cache key: `['agents']`.

### `useAgentToolsQuery(agentSlug: string | undefined, config?)`

Fetches tools for an agent. Disabled when `agentSlug` is undefined.

### `useModelsQuery(config?)`

Fetches available Bedrock models.

### `useModelCapabilitiesQuery(config?)`

Fetches model capabilities. Returns `[]` on 401 (credentials not configured).

### `useLayoutQuery(slug: string, config?)`

Fetches a single layout.

### `useLayoutsQuery(config?)`

Fetches all layouts.

### `useConversationsQuery(agentSlug: string | undefined, config?)`

Fetches conversations for an agent. Disabled when `agentSlug` is undefined.

### `useConfigQuery(config?)`

Fetches app configuration.

### `useStatsQuery(agentSlug, conversationId, config?)`

Fetches conversation stats. Disabled when either param is undefined.

### `useUsageQuery(config?)`

Fetches usage analytics.

### `useAchievementsQuery(config?)`

Fetches achievement data.

### `useProjectsQuery(config?)`

Fetches all projects.

### `useProjectQuery(slug: string, config?)`

Fetches a single project by slug.

### `useProjectLayoutsQuery(projectSlug: string, config?)`

Fetches layouts for a project.

### `useProjectConversationsQuery(projectSlug: string, limit?, config?)`

Fetches recent conversations for a project. Default limit: 10.

### `useCreateProjectMutation()`

Creates a new project. Invalidates `['projects']` on success.

### `useUpdateProjectMutation()`

Updates a project. Invalidates `['projects']` on success.

### `useDeleteProjectMutation()`

Deletes a project. Invalidates `['projects']` on success.

### `useCreateLayoutMutation(projectSlug: string)`

Creates a new layout within a project. Invalidates project layouts on success.

### `useAddLayoutFromPluginMutation(projectSlug: string)`

Adds a layout from an installed plugin to a project. Invalidates project layouts on success.

### `useKnowledgeDocsQuery(projectSlug, namespace?, config?)`

Fetches knowledge documents for a project, optionally filtered by namespace.

### `useKnowledgeStatusQuery(projectSlug, config?)`

Fetches the knowledge index status for a project.

### `useKnowledgeSearchQuery(projectSlug, query, namespace?, config?)`

Performs semantic search across a project's knowledge base.

### `useKnowledgeNamespacesQuery(projectSlug, config?)`

Fetches knowledge namespaces for a project.

### `useKnowledgeDocContentQuery(projectSlug, docId, namespace?, config?)`

Fetches the content of a specific knowledge document. Disabled when `docId` is null.

### `useKnowledgeScanMutation(projectSlug)`

Triggers a directory scan to ingest documents into the knowledge base.

### `useKnowledgeSaveMutation(projectSlug, namespace?)`

Saves/uploads a document to the knowledge base.

### `useKnowledgeDeleteMutation(projectSlug, namespace?)`

Deletes a single knowledge document.

### `useKnowledgeBulkDeleteMutation(projectSlug, namespace?)`

Bulk-deletes knowledge documents.

### `useGitStatusQuery(workingDirectory, config?)`

Fetches git status for a working directory. Disabled when `workingDirectory` is null/undefined.

### `useGitLogQuery(workingDirectory, count?, config?)`

Fetches git log for a working directory. Default count: 5. Disabled when `workingDirectory` is null/undefined.

### `usePromptsQuery(config?)`

Fetches all prompts from the prompt registry.

### `useModelCapabilitiesQuery(config?)`

Fetches model capabilities. Returns `[]` on 401 (credentials not configured).

### `useAgentInvokeMutation(agentSlug: string)`

Fire-and-forget agent invocation mutation. Returns a `useMutation` result.

```tsx
const { mutate } = useAgentInvokeMutation('my-agent');
mutate('Summarize this document');
```

### `useInvokeAgent<T>(agentSlug, content, options?, config?)`

Invokes an agent and caches the result. Cache key: `['invoke', agentSlug, content, options]`.

```tsx
const { data, isLoading } = useInvokeAgent('my-agent', 'Summarize this', { schema: MySchema });
```

### `useApiQuery<T>(queryKey, queryFn, config?)`

Generic query hook for custom API calls.

```tsx
const { data } = useApiQuery(['my-key'], () => fetch('/api/custom').then(r => r.json()));
```

### `useApiMutation<TData, TVariables>(mutationFn, options?)`

Mutation hook with optional cache invalidation on success.

```tsx
const mutation = useApiMutation(
  (vars) => fetch('/api/save', { method: 'POST', body: JSON.stringify(vars) }).then(r => r.json()),
  { invalidateKeys: [['agents']] }
);
mutation.mutate({ name: 'new-agent' });
```

### `useInvalidateQuery(): (queryKey) => void`

Returns a function to manually invalidate a query cache entry.

### `useQueryClient`

Re-exported from `@tanstack/react-query` for direct cache access.

---

## API Functions

Imperative API calls — use in event handlers, slash commands, or anywhere hooks aren't available.

### `sendMessage(agentSlug, content, options?): Promise<any>`

Sends a message to an agent (non-streaming).

```ts
interface SendMessageOptions {
  model?: string;
  conversationId?: string;
  userId?: string;
  attachments?: Array<{ type: string; content: string; mimeType?: string }>;
}
```

```ts
const result = await sendMessage('my-agent', 'Hello', { conversationId: 'abc' });
```

### `streamMessage(agentSlug, content, options?): Promise<void>`

Streams a response from an agent.

```ts
interface StreamMessageOptions extends SendMessageOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}
```

```ts
await streamMessage('my-agent', 'Explain this', {
  onChunk: (chunk) => setOutput(prev => prev + chunk),
  onComplete: () => setDone(true),
});
```

### `invokeAgent(agentSlug, content, options?): Promise<any>`

Invokes an agent silently (no user confirmation). Supports structured output via `schema`.

```ts
const result = await invokeAgent('my-agent', 'Extract data', { schema: MyZodSchema });
```

### `invoke(options: InvokeOptions): Promise<any>`

Lightweight multi-turn invocation without a named agent. Supports tool calling and structured output.

```ts
interface InvokeOptions {
  prompt: string;
  schema?: any;
  tools?: string[];
  maxSteps?: number;
  model?: string;
  structureModel?: string;
  system?: string;
}
```

```ts
const result = await invoke({ prompt: 'What is 2+2?', schema: NumberSchema });
```

### `callTool(agentSlug, toolName, toolArgs?): Promise<any>`

Calls an MCP tool directly on an agent. No server-side transform.

```ts
const data = await callTool('my-agent', 'get_account', { id: '123' });
```

### `fetchConfig(): Promise<any>`

Fetches app configuration imperatively.

### `transformTool(agentSlug, toolName, toolArgs, transformFn): Promise<any>`

**Removed.** Use `callTool` instead.

---

## Components

Unstyled (inline styles only) UI primitives that respect the app's CSS variables.

### `Button`

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'ghost'; // default: 'primary'
  size?: 'sm' | 'md' | 'lg';                               // default: 'md'
  loading?: boolean;
}
```

```tsx
<Button variant="secondary" size="sm" onClick={handleClick}>
  Run
</Button>
```

### `Pill`

Inline label/tag component.

```tsx
interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'; // default: 'default'
  size?: 'sm' | 'md';                                                  // default: 'md'
  removable?: boolean;
  onRemove?: () => void;
}
```

```tsx
<Pill variant="success" removable onRemove={() => removeTag(tag)}>
  {tag}
</Pill>
```

### `Spinner`

```tsx
<Spinner size="sm" />   // size: 'sm' | 'md' | 'lg', default: 'md'
<Spinner color="#fff" />
```

### `LoadingState`

Inline loading indicator with message.

```tsx
<LoadingState message="Fetching data..." size="sm" />
// size: 'sm' | 'md', default: 'md'
```

### `FullScreenLoader`

Full-viewport loading screen with rotating phrases.

```tsx
<FullScreenLoader
  message="Loading..."       // static message; overrides phrases if set
  phrases={['Loading...']}   // rotating phrases (default: built-in list)
  interval={3000}            // ms between phrase changes, default: 3000
  showLogo={true}            // show /favicon.png, default: true
/>
```

### `AutoSelectModal`

Keyboard-navigable search/select modal.

```tsx
interface AutoSelectItem<T = any> {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  metadata?: T;
  badge?: string;
  timestamp?: string;
  isActive?: boolean;
}

interface AutoSelectModalProps<T = any> {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  items: AutoSelectItem<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onSelect: (item: AutoSelectItem<T>) => void;
  onClose: () => void;
  renderIcon?: (item: AutoSelectItem<T>) => ReactNode;
  renderMetadata?: (item: AutoSelectItem<T>) => ReactNode;
  showCancel?: boolean;
}
```

```tsx
<AutoSelectModal
  isOpen={open}
  title="Select Agent"
  items={agents.map(a => ({ id: a.slug, title: a.name }))}
  onSelect={(item) => setAgent(item.id)}
  onClose={() => setOpen(false)}
/>
```

Keyboard: `↑`/`↓` to navigate, `Enter` to select, `Escape` to close.

---

## Context Providers

### `SDKProvider`

Injects the SDK context into a plugin tree. Used by the runtime — plugins don't call this directly.

```tsx
<SDKProvider value={sdkContextValue}>
  {children}
</SDKProvider>
```

### `LayoutProvider`

Wraps a layout plugin with SDK context and sets the layout for agent resolution.

```tsx
<LayoutProvider sdk={sdkContextValue} layout={layoutConfig}>
  {children}
</LayoutProvider>
```

### `LayoutNavigationProvider`

Manages per-tab URL hash state for layout plugins with multiple tabs. Persists state to `sessionStorage` and restores it on tab switch.

```tsx
<LayoutNavigationProvider layoutSlug="my-layout" activeTabId={activeTab}>
  {children}
</LayoutNavigationProvider>
```

#### `useLayoutNavigation()`

Must be called inside `LayoutNavigationProvider`.

```ts
{
  getTabState: (tabId: string) => string;
  setTabState: (tabId: string, state: string) => void;
  clearTabState: (tabId: string) => void;
}
```

---

## Agent Resolver

Utilities for working with agent slugs.

### `resolveAgentName(agentName: string, layout?: LayoutConfig): string`

Resolves a short agent name to a fully-qualified `namespace:name` slug using layout context. Returns the name unchanged if it already contains `:` or no match is found.

```ts
resolveAgentName('my-agent'); // → 'sa-agent:my-agent' (if in layout context)
resolveAgentName('sa-agent:my-agent'); // → 'sa-agent:my-agent' (unchanged)
```

### `parseAgentSlug(slug: string): { namespace?: string; name: string }`

Splits a slug into namespace and name.

```ts
parseAgentSlug('sa-agent:my-agent'); // → { namespace: 'sa-agent', name: 'my-agent' }
parseAgentSlug('my-agent');          // → { name: 'my-agent' }
```

### `isLayoutAgent(slug: string): boolean`

Returns `true` if the slug is namespace-qualified.

```ts
isLayoutAgent('sa-agent:my-agent'); // true
isLayoutAgent('my-agent');          // false
```

### `agentQueries`

Query factory for imperative fetching (e.g. in slash commands). Returns React Query config objects.

```ts
agentQueries.agent(agentSlug)                        // GET /agents/:slug
agentQueries.tools(agentSlug)                        // GET /agents/:slug/tools
agentQueries.stats(agentSlug, conversationId)        // GET /agents/:slug/conversations/:id/stats
```

```ts
import { agentQueries } from '@stallion-ai/sdk';
import { useQueryClient } from '@stallion-ai/sdk';

const queryClient = useQueryClient();
const agent = await queryClient.fetchQuery(agentQueries.agent('my-agent'));
```

---

## Voice

Registries and interfaces for STT/TTS providers. Providers register themselves on import; the app subscribes to registry changes.

### `voiceRegistry`

```ts
voiceRegistry.registerSTT(provider: STTProvider): void
voiceRegistry.registerTTS(provider: TTSProvider): void
voiceRegistry.unregisterSTT(id: string): void
voiceRegistry.unregisterTTS(id: string): void
voiceRegistry.getAvailableSTT(): STTProvider[]
voiceRegistry.getAvailableTTS(): TTSProvider[]
voiceRegistry.getSTT(id: string): STTProvider | undefined
voiceRegistry.getTTS(id: string): TTSProvider | undefined
voiceRegistry.subscribe(fn: () => void): () => void  // useSyncExternalStore-compatible
```

### `STTProvider` interface

```ts
interface STTProvider {
  readonly id: string;
  readonly name: string;
  readonly isSupported: boolean;
  readonly state: 'idle' | 'listening' | 'error';
  readonly transcript: string;
  startListening(opts?: STTOptions): void;
  stopListening(): void;
  subscribe(fn: () => void): () => void;
}

interface STTOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}
```

### `TTSProvider` interface

```ts
interface TTSProvider {
  readonly id: string;
  readonly name: string;
  readonly isSupported: boolean;
  readonly speaking: boolean;
  speak(text: string, opts?: TTSOptions): void;
  cancel(): void;
  subscribe(fn: () => void): () => void;
}

interface TTSOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}
```

### `ConversationalVoiceProvider` interface

Bidirectional provider (e.g. Nova Sonic). Extends both `STTProvider` and `TTSProvider`.

```ts
interface ConversationalVoiceProvider extends STTProvider, TTSProvider {
  readonly sessionState: 'idle' | 'active' | 'error';
  startSession(opts?: ConversationalOptions): void;
  endSession(): void;
}

interface ConversationalOptions {
  lang?: string;
  region?: string;
}
```

### `ProviderCapability`

Shape returned by `GET /api/system/capabilities` for each provider.

```ts
interface ProviderCapability {
  id: string;
  name: string;
  clientOnly: boolean;   // true = runs in browser (WebSpeech), no server config needed
  visibleOn: ('all' | 'mobile' | 'desktop')[];
  configured: boolean;   // false if server lacks credentials
}
```

---

## Context Registry

For plugins that contribute ambient message context (e.g. timezone, location).

### `contextRegistry`

```ts
contextRegistry.register(provider: MessageContextProvider): void
contextRegistry.unregister(id: string): void
contextRegistry.getAll(): MessageContextProvider[]
contextRegistry.get(id: string): MessageContextProvider | undefined
contextRegistry.getComposedContext(): string | null  // all enabled providers joined by \n
contextRegistry.subscribe(fn: () => void): () => void
```

### `MessageContextProvider` interface

```ts
interface MessageContextProvider {
  readonly id: string;
  readonly name: string;
  enabled: boolean;
  getContext(): string | null;
  subscribe(fn: () => void): () => void;
}
```

### `ContextCapability`

```ts
interface ContextCapability {
  id: string;
  name: string;
  visibleOn: Array<'all' | 'mobile' | 'desktop'>;
}
```

---

## Workspace Providers

Plugin-defined data providers scoped to a layout (e.g. a CRM data source).

### `registerProvider(id, metadata, factory)`

Registers a provider. Called by layout plugins on load.

```ts
registerProvider('my-crm', { layout: 'sales', type: 'crm' }, () => new MyCRMProvider());
```

### `getProvider<T>(layout, type): T`

Returns the active provider instance for a layout/type pair.

### `hasProvider(layout, type): boolean`

Returns `true` if a provider is configured for the layout/type.

### `getActiveProviderId(layout, type): string | null`

Returns the ID of the active provider.

### `configureProvider(layout, type, providerId)`

Sets the active provider for a layout/type (used by plugins to set defaults).

### `ProviderMetadata`

```ts
interface ProviderMetadata {
  layout: string;
  type: string;
}
```

---

## Utilities

### `ListenerManager`

Base class for implementing the `useSyncExternalStore` subscribe pattern. Extend this to build custom providers.

```ts
class ListenerManager {
  readonly subscribe: (fn: () => void) => () => void;
  protected _notify(): void;
  protected _clearListeners(): void;
}
```

```ts
class MyProvider extends ListenerManager {
  private _value = 0;

  increment() {
    this._value++;
    this._notify(); // triggers React re-renders
  }

  get value() { return this._value; }
}
```

### `noopSubscribe`

A no-op subscribe function for `useSyncExternalStore` when no provider is active. Shared reference — avoids creating new functions per render.

```ts
const noopSubscribe: (fn: () => void) => () => void
```

---

## Types

Core types re-exported from `@stallion-ai/shared` plus SDK-specific types.

### Shared types (from `@stallion-ai/shared`)

`AgentSpec`, `AgentSummary` (SDK), `AgentMetadata`, `AgentUIConfig`, `AgentGuardrails`, `AgentTools`, `AgentQuickPrompt`, `LayoutConfig`, `StandaloneLayoutConfig`, `LayoutTab`, `LayoutAction`, `LayoutPrompt`, `PluginManifest`, `SlashCommand`, `SlashCommandParam`, `ToolDef`, `ToolMetadata`, `ToolPermissions`, `ToolCallResponse`, `ConversationStats`

### SDK-specific types

```ts
interface AgentSummary {
  slug: string;
  name: string;
  prompt?: string;
  model?: string;
  region?: string;
  source?: 'local' | 'acp';
  guardrails?: AgentGuardrails;
  tools?: AgentTools;
  ui?: AgentUIConfig;
}

interface Agent extends AgentSummary {}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];
  toolCalls?: ToolCall[];
  finishReason?: string;
}

interface MessageAttachment {
  type: string;
  content: string;
  mimeType?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  result?: any;
  status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'error';
}

interface Conversation {
  id: string;
  agentSlug: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

interface NavigationState {
  currentView: string;
  selectedLayout?: string;
  selectedAgent?: string;
  dockState: boolean;
  dockHeight: number;
  dockMaximized: boolean;
}

interface InvokeOptions {
  conversationId?: string;
  userId?: string;
  model?: string;
  tools?: string[];
  maxSteps?: number;
  signal?: AbortSignal;
}

interface InvokeResult {
  success: boolean;
  output?: string;
  error?: string;
  toolCalls?: any[];
}

interface LayoutComponentProps {
  agent?: AgentSummary;
  layout?: LayoutConfig;
  activeTab?: WorkspaceTab;
  onLaunchPrompt?: (prompt: AgentQuickPrompt) => void;
  onLaunchWorkflow?: (workflowId: string) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

type WorkspaceComponent = (props: LayoutComponentProps) => ReactElement;
type EventHandler<T = any> = (event: T) => void;
```
