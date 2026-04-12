import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workflowDir = new URL('../.github/workflows/', import.meta.url);

const requiredFiles = [
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/feature-request.yml',
  '.github/ISSUE_TEMPLATE/docs-issue.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/ci-extended.yml',
  'docs/reference/contracts.md',
  'SECURITY.md',
];

const errors = [];

function listSourceFiles(directory) {
  const entries = readdirSync(new URL(`../${directory}`, import.meta.url), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === 'dist' ||
      entry.name === 'node_modules' ||
      entry.name === '__tests__'
    ) {
      continue;
    }
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(relativePath));
      continue;
    }
    if (/\.(cts|mts|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      files.push(relativePath);
    }
  }
  return files;
}

for (const artifact of [
  'packages/contracts/src/provider.js',
  'packages/contracts/src/provider.d.ts',
]) {
  if (existsSync(new URL(`../${artifact}`, import.meta.url))) {
    errors.push(`Contracts source must not contain generated artifact ${artifact}.`);
  }
}

for (const relativePath of requiredFiles) {
  const absolutePath = new URL(`../${relativePath}`, import.meta.url);
  if (!existsSync(absolutePath)) {
    errors.push(`Missing required convergence file: ${relativePath}`);
  }
}

const ciWorkflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);
const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
if (ciWorkflow.includes('continue-on-error')) {
  errors.push('Primary PR CI workflow must not use continue-on-error.');
}
if (!ciWorkflow.includes('npm run ci:fast')) {
  errors.push('Primary PR CI workflow must execute npm run ci:fast.');
}
if (!ciWorkflow.includes('npm run test:connected-agents')) {
  errors.push('Primary PR CI workflow must execute the connected-agents suite.');
}

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
for (const scriptName of ['verify:convergence', 'ci:fast', 'ci:extended']) {
  if (typeof packageJson.scripts?.[scriptName] !== 'string') {
    errors.push(`package.json is missing required script: ${scriptName}`);
  }
}

const allowedSharedImportFiles = new Map([
  ['packages/cli/src/commands/build.ts', ['@stallion-ai/shared/build', '@stallion-ai/shared/parsers']],
  ['packages/cli/src/commands/helpers.ts', ['@stallion-ai/shared/parsers']],
  ['packages/cli/src/commands/install.ts', ['@stallion-ai/shared/build', '@stallion-ai/shared/parsers']],
  ['packages/cli/src/commands/lifecycle.ts', ['@stallion-ai/shared/git']],
  ['packages/cli/src/dev/server.ts', ['@stallion-ai/shared/build']],
  ['packages/cli/src/dev/http.ts', ['@stallion-ai/shared/mcp']],
  ['packages/cli/src/dev/mcp.ts', ['@stallion-ai/shared/mcp', '@stallion-ai/shared/parsers']],
  ['src-server/routes/plugin-bundles.ts', ['@stallion-ai/shared/build']],
  ['src-server/routes/plugin-install-routes.ts', ['@stallion-ai/shared/parsers']],
  ['src-server/routes/plugin-install-shared.ts', ['@stallion-ai/shared/parsers']],
  ['src-server/routes/plugin-lifecycle-routes.ts', ['@stallion-ai/shared/parsers']],
  ['src-server/routes/system-update-routes.ts', ['@stallion-ai/shared/git']],
]);

for (const relativePath of [
  ...listSourceFiles('packages/cli'),
  ...listSourceFiles('packages/connect'),
  ...listSourceFiles('packages/contracts'),
  ...listSourceFiles('packages/sdk'),
  ...listSourceFiles('src-server'),
  ...listSourceFiles('src-ui'),
]) {
  const fileContents = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  if (!fileContents.includes('@stallion-ai/shared')) {
    continue;
  }
  const allowedImports = allowedSharedImportFiles.get(relativePath);
  if (!allowedImports) {
    errors.push(
      `${relativePath} must not import from @stallion-ai/shared; use @stallion-ai/contracts/* or an explicit helper layer instead.`,
    );
    continue;
  }
  for (const requiredImportFragment of allowedImports) {
    if (!fileContents.includes(requiredImportFragment)) {
      errors.push(
        `${relativePath} may only use its approved @stallion-ai/shared helper imports (${requiredImportFragment} missing).`,
      );
    }
  }
  if (fileContents.includes("from '@stallion-ai/shared'")) {
    errors.push(
      `${relativePath} must import shared helpers from explicit subpaths instead of the @stallion-ai/shared root.`,
    );
  }
}

const terminalService = readFileSync(
  new URL('../src-server/services/terminal-service.ts', import.meta.url),
  'utf8',
);
if (!terminalService.includes('./terminal-shells')) {
  errors.push('TerminalService must delegate shell resolution to terminal-shells.ts.');
}
if (!terminalService.includes('./terminal-subprocess-state')) {
  errors.push('TerminalService must delegate subprocess polling to terminal-subprocess-state.ts.');
}
for (const retiredInlineTerminalSnippet of [
  'interface ShellCandidate {',
  'private resolveShell()',
  "{ shell: '/bin/zsh', args: ['-o', 'nopromptsp'] }",
  "`powershell -NoProfile -Command \"Get-Process -Id ${entry.pid} -ErrorAction SilentlyContinue\"`",
  "`pgrep -P ${entry.pid}`",
]) {
  if (terminalService.includes(retiredInlineTerminalSnippet)) {
    errors.push(`TerminalService must not inline terminal shell resolution helper ${retiredInlineTerminalSnippet}.`);
  }
}

const terminalShells = readFileSync(
  new URL('../src-server/services/terminal-shells.ts', import.meta.url),
  'utf8',
);
for (const requiredTerminalShellHelper of [
  'export interface ShellCandidate',
  'export function resolveTerminalShellCandidates',
  "{ shell: '/bin/zsh', args: ['-o', 'nopromptsp'] }",
]) {
  if (!terminalShells.includes(requiredTerminalShellHelper)) {
    errors.push(`terminal-shells.ts must include ${requiredTerminalShellHelper}.`);
  }
}

const terminalSubprocessState = readFileSync(
  new URL('../src-server/services/terminal-subprocess-state.ts', import.meta.url),
  'utf8',
);
for (const requiredTerminalHelper of [
  'export function pollTerminalSubprocessActivity',
  'function detectWindowsSubprocesses',
  'function detectUnixSubprocesses',
  "Get-Process -Id ${pid}",
  'pgrep -P ${pid}',
]) {
  if (!terminalSubprocessState.includes(requiredTerminalHelper)) {
    errors.push(`terminal-subprocess-state.ts must include ${requiredTerminalHelper}.`);
  }
}

const toolManagementView = readFileSync(
  new URL('../src-ui/src/views/ToolManagementView.tsx', import.meta.url),
  'utf8',
);
if (toolManagementView.includes('fetch(')) {
  errors.push('ToolManagementView must not issue raw fetch() calls.');
}
if (!toolManagementView.includes("../lib/agentToolsApi")) {
  errors.push('ToolManagementView must import the agent tools API helper.');
}

const playbooksViewPath = new URL(
  '../src-ui/src/views/PlaybooksView.tsx',
  import.meta.url,
);
const playbooksView = readFileSync(playbooksViewPath, 'utf8');
if (playbooksView.includes('fetch(')) {
  errors.push('PlaybooksView must not issue raw fetch() calls.');
}
if (!playbooksView.includes('usePlaybooksViewModel')) {
  errors.push('PlaybooksView must delegate orchestration to usePlaybooksViewModel.');
}
for (const requiredImport of [
  './playbooks/PlaybooksEditor',
  './playbooks/PlaybooksModalStack',
  './playbooks/usePlaybooksViewModel',
  './playbooks/utils',
]) {
  if (!playbooksView.includes(requiredImport)) {
    errors.push(`PlaybooksView must delegate extracted UI/helpers to ${requiredImport}.`);
  }
}
for (const retiredInlinePlaybooksSnippet of [
  'interface PromptForm {',
  'const EMPTY_FORM: PromptForm = {',
  'function promptToForm(p: Playbook): PromptForm {',
  'function exportPrompt(prompt: Playbook) {',
  'function buildPayload() {',
  'function validateTemplateVariables(content: string) {',
  '<ConfirmModal',
  '<PromptRunModal',
  '<ImportPromptsModal',
  'const categories = useMemo(',
  'const filtered = useMemo(',
]) {
  if (playbooksView.includes(retiredInlinePlaybooksSnippet)) {
    errors.push(`PlaybooksView must not inline extracted playbook helper ${retiredInlinePlaybooksSnippet}.`);
  }
}

const playbooksEditor = readFileSync(
  new URL('../src-ui/src/views/playbooks/PlaybooksEditor.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function PlaybooksEditor',
  '../components/DetailHeader',
  '../components/Toggle',
]) {
  if (!playbooksEditor.includes(requiredHelper)) {
    errors.push(`PlaybooksEditor.tsx must include ${requiredHelper}.`);
  }
}

const playbooksUtils = readFileSync(
  new URL('../src-ui/src/views/playbooks/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface PlaybookForm',
  'export const EMPTY_PLAYBOOK_FORM',
  'export function playbookToForm',
  'export function buildPlaybookPayload',
  'export function buildPlaybookExportMarkdown',
  'export function buildPlaybookFilename',
  'export function extractTemplateVariables',
]) {
  if (!playbooksUtils.includes(requiredHelper)) {
    errors.push(`playbooks/utils.ts must include ${requiredHelper}.`);
  }
}

const playbooksViewModel = readFileSync(
  new URL('../src-ui/src/views/playbooks/usePlaybooksViewModel.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function usePlaybooksViewModel',
  '../../hooks/useActiveChatSessions',
  './view-utils',
]) {
  if (!playbooksViewModel.includes(requiredHelper)) {
    errors.push(`usePlaybooksViewModel.ts must include ${requiredHelper}.`);
  }
}

const playbooksModalStack = readFileSync(
  new URL('../src-ui/src/views/playbooks/PlaybooksModalStack.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function PlaybooksModalStack',
  '../../components/ConfirmModal',
  '../../components/ImportPromptsModal',
  '../../components/PromptRunModal',
]) {
  if (!playbooksModalStack.includes(requiredHelper)) {
    errors.push(`PlaybooksModalStack.tsx must include ${requiredHelper}.`);
  }
}

const playbooksViewUtils = readFileSync(
  new URL('../src-ui/src/views/playbooks/view-utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildPlaybookCategories',
  'export function filterAndSortPlaybooks',
  'export function buildPlaybookListItems',
]) {
  if (!playbooksViewUtils.includes(requiredHelper)) {
    errors.push(`playbooks/view-utils.ts must include ${requiredHelper}.`);
  }
}

const promptsViewPath = new URL(
  '../src-ui/src/views/PromptsView.tsx',
  import.meta.url,
);
if (existsSync(promptsViewPath)) {
  errors.push('Legacy PromptsView must be removed after playbook convergence.');
}

const cliInstallCommand = readFileSync(
  new URL('../packages/cli/src/commands/install.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './install-preview.js',
  './install-source.js',
  './install-registry.js',
]) {
  if (!cliInstallCommand.includes(requiredImport)) {
    errors.push(`packages/cli/src/commands/install.ts must delegate through ${requiredImport}.`);
  }
}
for (const retiredInlineInstallSnippet of [
  'function findInstalledLayoutProvider(',
  'console.log(`🔍 Previewing plugin from ${source}...`);',
  'const configPath = join(PROJECT_HOME, \'config.json\');',
  'execSync(`curl -sf "${url}"`',
]) {
  if (cliInstallCommand.includes(retiredInlineInstallSnippet)) {
    errors.push(`packages/cli/src/commands/install.ts must not inline extracted install helper ${retiredInlineInstallSnippet}.`);
  }
}

const cliInstallPreview = readFileSync(
  new URL('../packages/cli/src/commands/install-preview.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function previewPlugin',
  'function findInstalledLayoutProvider',
  'function getPluginConflicts',
]) {
  if (!cliInstallPreview.includes(requiredHelper)) {
    errors.push(`install-preview.ts must include ${requiredHelper}.`);
  }
}

const cliInstallSource = readFileSync(
  new URL('../packages/cli/src/commands/install-source.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function preparePluginSource',
  'export function installPluginPackageDependencies',
  'export function canonicalizePluginDirectory',
]) {
  if (!cliInstallSource.includes(requiredHelper)) {
    errors.push(`install-source.ts must include ${requiredHelper}.`);
  }
}

const cliInstallRegistry = readFileSync(
  new URL('../packages/cli/src/commands/install-registry.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function showOrSaveRegistry',
  'function readConfiguredRegistryUrl',
  'function saveRegistryUrl',
]) {
  if (!cliInstallRegistry.includes(requiredHelper)) {
    errors.push(`install-registry.ts must include ${requiredHelper}.`);
  }
}

const registryView = readFileSync(
  new URL('../src-ui/src/views/RegistryView.tsx', import.meta.url),
  'utf8',
);
if (registryView.includes('fetch(')) {
  errors.push('RegistryView must not issue raw fetch() calls.');
}
if (!registryView.includes('useRegistryItemsQuery')) {
  errors.push('RegistryView must use SDK registry query hooks.');
}

const integrationsView = readFileSync(
  new URL('../src-ui/src/views/IntegrationsView.tsx', import.meta.url),
  'utf8',
);
if (integrationsView.includes('fetch(')) {
  errors.push('IntegrationsView must not issue raw fetch() calls.');
}
if (!integrationsView.includes('useIntegrationsQuery')) {
  errors.push('IntegrationsView must use shared SDK integration hooks.');
}
for (const requiredImport of [
  './integrations/RegistryModal',
  './integrations/IntegrationEditorPanel',
  './integrations/DeleteIntegrationModal',
  './integrations/utils',
]) {
  if (!integrationsView.includes(requiredImport)) {
    errors.push(`IntegrationsView must delegate extracted UI to ${requiredImport}.`);
  }
}
for (const retiredInlineIntegrationsSnippet of [
  'function RegistryModal({',
  'const formToMcpJson = (form: IntegrationDef): string => {',
  'const parseMcpJson = (json: string): IntegrationDef | null => {',
  'className="plugins__confirm-overlay"',
  'className="integration__mode-tabs"',
]) {
  if (integrationsView.includes(retiredInlineIntegrationsSnippet)) {
    errors.push(
      `IntegrationsView must not inline extracted integrations UI ${retiredInlineIntegrationsSnippet}.`,
    );
  }
}

const projectsContext = readFileSync(
  new URL('../src-ui/src/contexts/ProjectsContext.tsx', import.meta.url),
  'utf8',
);
if (projectsContext.includes('fetch(')) {
  errors.push('ProjectsContext must not issue raw fetch() calls.');
}
if (!projectsContext.includes('useProjectsQuery')) {
  errors.push('ProjectsContext must use shared SDK project hooks.');
}

const configContext = readFileSync(
  new URL('../src-ui/src/contexts/ConfigContext.tsx', import.meta.url),
  'utf8',
);
if (configContext.includes('fetch(')) {
  errors.push('ConfigContext must not issue raw fetch() calls.');
}
if (!configContext.includes('useUpdateConfigMutation')) {
  errors.push('ConfigContext must use the shared SDK config mutation hook.');
}

const agentsContext = readFileSync(
  new URL('../src-ui/src/contexts/AgentsContext.tsx', import.meta.url),
  'utf8',
);
if (agentsContext.includes('fetch(')) {
  errors.push('AgentsContext must not issue raw fetch() calls.');
}
for (const requiredHook of [
  'useAgentsQuery',
  'useCreateAgentMutation',
  'useUpdateAgentMutation',
  'useDeleteAgentMutation',
]) {
  if (!agentsContext.includes(requiredHook)) {
    errors.push(`AgentsContext must use ${requiredHook}.`);
  }
}

const authContext = readFileSync(
  new URL('../src-ui/src/contexts/AuthContext.tsx', import.meta.url),
  'utf8',
);
if (authContext.includes('fetch(')) {
  errors.push('AuthContext must not issue raw fetch() calls.');
}
for (const requiredHook of ['useAuthStatusQuery', 'useRenewAuthMutation']) {
  if (!authContext.includes(requiredHook)) {
    errors.push(`AuthContext must use ${requiredHook}.`);
  }
}

const analyticsContext = readFileSync(
  new URL('../src-ui/src/contexts/AnalyticsContext.tsx', import.meta.url),
  'utf8',
);
if (analyticsContext.includes('fetch(')) {
  errors.push('AnalyticsContext must not issue raw fetch() calls.');
}
if (!analyticsContext.includes('useAnalyticsRescanMutation')) {
  errors.push('AnalyticsContext must use the shared analytics rescan mutation.');
}

const usageAggregator = readFileSync(
  new URL('../src-server/analytics/usage-aggregator.ts', import.meta.url),
  'utf8',
);
if (!usageAggregator.includes('./usage-aggregator-state.js')) {
  errors.push('usage-aggregator.ts must delegate state math to usage-aggregator-state.ts.');
}
for (const retiredInlineUsageSnippet of [
  'private getEmptyStats(): UsageStats',
  'private updateDaily(',
  'private computeStreakStats(',
]) {
  if (usageAggregator.includes(retiredInlineUsageSnippet)) {
    errors.push(`usage-aggregator.ts must not inline extracted state helper ${retiredInlineUsageSnippet}.`);
  }
}

const usageAggregatorState = readFileSync(
  new URL('../src-server/analytics/usage-aggregator-state.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createEmptyUsageStats',
  'export function updateDailyUsage',
  'export function computeStreakStats',
  'export function applyMessageToUsageStats',
  'export function mergeRescannedUsageStats',
  'export function checkAchievement',
  'export function getAchievementProgress',
]) {
  if (!usageAggregatorState.includes(requiredHelper)) {
    errors.push(`usage-aggregator-state.ts must include ${requiredHelper}.`);
  }
}

const feedbackService = readFileSync(
  new URL('../src-server/services/feedback-service.ts', import.meta.url),
  'utf8',
);
if (!feedbackService.includes("./feedback-analysis.js")) {
  errors.push('feedback-service.ts must delegate analysis helpers to feedback-analysis.ts.');
}
for (const retiredInlineFeedbackSnippet of [
  'function escapeXml(',
  'function escapeAttr(',
  'function extractJson(',
  'const ratingsXml = pending',
  'const liked = analyzed',
  'const prompt = `You are aggregating user feedback to identify patterns.',
]) {
  if (feedbackService.includes(retiredInlineFeedbackSnippet)) {
    errors.push(`feedback-service.ts must not inline extracted feedback helper ${retiredInlineFeedbackSnippet}.`);
  }
}

const feedbackAnalysis = readFileSync(
  new URL('../src-server/services/feedback-analysis.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function extractJson',
  'export async function runMiniFeedbackAnalysis',
  'export async function runFullFeedbackAnalysis',
]) {
  if (!feedbackAnalysis.includes(requiredHelper)) {
    errors.push(`feedback-analysis.ts must include ${requiredHelper}.`);
  }
}

const monitoringContext = readFileSync(
  new URL('../src-ui/src/contexts/MonitoringContext.tsx', import.meta.url),
  'utf8',
);
if (monitoringContext.includes('fetch(')) {
  errors.push('MonitoringContext must not issue raw fetch() calls.');
}
for (const requiredHook of ['fetchMonitoringEvents', 'useMonitoringStatsQuery']) {
  if (!monitoringContext.includes(requiredHook)) {
    errors.push(`MonitoringContext must use ${requiredHook}.`);
  }
}

const eventEntry = readFileSync(
  new URL('../src-ui/src/components/monitoring/EventEntry.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './event-entry/EventEntryHeader',
  './event-entry/EventEntrySections',
]) {
  if (!eventEntry.includes(requiredImport)) {
    errors.push(`EventEntry.tsx must delegate extracted monitoring UI to ${requiredImport}.`);
  }
}
for (const retiredInlineEventEntrySnippet of [
  'function IntegrationBadges(',
  'function HealthChecksSection(',
  'function ToolResultSection(',
  'function UsageStatsSection(',
]) {
  if (eventEntry.includes(retiredInlineEventEntrySnippet)) {
    errors.push(`EventEntry.tsx must not inline extracted monitoring helper ${retiredInlineEventEntrySnippet}.`);
  }
}

const eventEntryUtils = readFileSync(
  new URL('../src-ui/src/components/monitoring/event-entry/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildEventTimestampTitle',
  'export function buildToolInputDisplay',
  'export function getArtifactSummary',
  'export function getTotalChars',
  'export function getTotalTokens',
]) {
  if (!eventEntryUtils.includes(requiredHelper)) {
    errors.push(`event-entry/utils.ts must include ${requiredHelper}.`);
  }
}

const conversationsContext = readFileSync(
  new URL('../src-ui/src/contexts/ConversationsContext.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './conversation-hooks',
  './conversations-store',
  './conversation-types',
]) {
  if (!conversationsContext.includes(requiredImport)) {
    errors.push(`ConversationsContext.tsx must delegate through ${requiredImport}.`);
  }
}
for (const retiredInlineConversationSnippet of [
  'class ConversationsStore',
  'export function useMessages(',
  'export function useConversationActions()',
  'export function useConversationStatus(',
  'fetchConversationMessages',
  'deleteConversationRequest',
  'streamConversationTurn',
]) {
  if (conversationsContext.includes(retiredInlineConversationSnippet)) {
    errors.push(`ConversationsContext.tsx must not inline extracted conversation helper ${retiredInlineConversationSnippet}.`);
  }
}

const conversationsStoreSource = readFileSync(
  new URL('../src-ui/src/contexts/conversations-store.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export class ConversationsStore',
  'export const conversationsStore = new ConversationsStore();',
  'fetchConversationMessages',
  'deleteConversationRequest',
  'streamConversationTurn',
]) {
  if (!conversationsStoreSource.includes(requiredHelper)) {
    errors.push(`conversations-store.ts must include ${requiredHelper}.`);
  }
}

const conversationHooksSource = readFileSync(
  new URL('../src-ui/src/contexts/conversation-hooks.ts', import.meta.url),
  'utf8',
);
for (const requiredHook of [
  'export function useConversations(',
  'export function useMessages(',
  'export function useConversationActions()',
  'export function useConversationStatus(',
]) {
  if (!conversationHooksSource.includes(requiredHook)) {
    errors.push(`conversation-hooks.ts must include ${requiredHook}.`);
  }
}

const sharedIndex = readFileSync(
  new URL('../packages/shared/src/index.ts', import.meta.url),
  'utf8',
);
if (!sharedIndex.includes("export * from './types.js';")) {
  errors.push('packages/shared/src/index.ts must re-export the dedicated shared types module.');
}
for (const retiredSharedRootExport of [
  "export * from './parsers.js';",
  "export * from './git.js';",
  "export * from './build.js';",
]) {
  if (sharedIndex.includes(retiredSharedRootExport)) {
    errors.push(`packages/shared/src/index.ts must not re-export ${retiredSharedRootExport}.`);
  }
}

const orchestrationServiceTest = readFileSync(
  new URL('../src-server/services/__tests__/orchestration-service.test.ts', import.meta.url),
  'utf8',
);
if (orchestrationServiceTest.includes("../../providers/types.js")) {
  errors.push(
    'src-server/services/__tests__/orchestration-service.test.ts must import provider interfaces directly, not ../../providers/types.js.',
  );
}
if (!orchestrationServiceTest.includes('../../providers/provider-interfaces.js')) {
  errors.push(
    'src-server/services/__tests__/orchestration-service.test.ts must import IProviderAdapterRegistry from ../../providers/provider-interfaces.js.',
  );
}

const orchestrationService = readFileSync(
  new URL('../src-server/services/orchestration-service.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './orchestration-session-state.js',
  'resolveOrchestrationAdapterForThread({',
  'projectOrchestrationEventToReadModel({',
  'recoverOrchestrationSessions({',
  'trackOrchestrationSession({',
]) {
  if (!orchestrationService.includes(requiredHelper)) {
    errors.push(`orchestration-service.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineOrchestrationSnippet of [
  'private async resolveAdapterForThread(',
  'private projectEventToReadModel(',
  'private mapSessionState(',
]) {
  if (orchestrationService.includes(retiredInlineOrchestrationSnippet)) {
    errors.push(`orchestration-service.ts must not inline extracted session-state logic ${retiredInlineOrchestrationSnippet}.`);
  }
}

const orchestrationSessionState = readFileSync(
  new URL('../src-server/services/orchestration-session-state.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function trackOrchestrationSession',
  'export async function resolveOrchestrationAdapterForThread',
  'export function projectOrchestrationEventToReadModel',
  'export async function recoverOrchestrationSessions',
]) {
  if (!orchestrationSessionState.includes(requiredHelper)) {
    errors.push(`orchestration-session-state.ts must include ${requiredHelper}.`);
  }
}

const themingGuide = readFileSync(
  new URL('../docs/guides/theming.md', import.meta.url),
  'utf8',
);
if (themingGuide.includes("../providers/types.js")) {
  errors.push(
    'docs/guides/theming.md must reference ../providers/provider-interfaces.js instead of ../providers/types.js.',
  );
}
for (const legacyType of [
  'export interface PluginManifest',
  'export interface AgentSpec',
  'export interface ConnectionConfig',
  'export interface AppConfig',
]) {
  if (sharedIndex.includes(legacyType)) {
    errors.push('packages/shared/src/index.ts must not inline the large shared type surface.');
    break;
  }
}

const sharedTypes = readFileSync(
  new URL('../packages/shared/src/types.ts', import.meta.url),
  'utf8',
);
for (const contractExport of [
  "@stallion-ai/contracts/acp",
  "@stallion-ai/contracts/agent",
  "@stallion-ai/contracts/auth",
  "@stallion-ai/contracts/catalog",
  "@stallion-ai/contracts/config",
  "@stallion-ai/contracts/knowledge",
  "@stallion-ai/contracts/layout",
  "@stallion-ai/contracts/notification",
  "@stallion-ai/contracts/plugin",
  "@stallion-ai/contracts/project",
  "@stallion-ai/contracts/runtime",
  "@stallion-ai/contracts/scheduler",
  "@stallion-ai/contracts/tool",
]) {
  if (!sharedTypes.includes(contractExport)) {
    errors.push(`packages/shared/src/types.ts must re-export ${contractExport}.`);
  }
}
if (!sharedTypes.includes('BUILTIN_KNOWLEDGE_NAMESPACES')) {
  errors.push(
    'packages/shared/src/types.ts must re-export BUILTIN_KNOWLEDGE_NAMESPACES from contracts.',
  );
}
for (const legacySharedDeclaration of [
  'export interface AgentSpec',
  'export interface AgentExecutionConfig',
  'export interface Playbook',
  'export interface Prompt',
  'export interface Skill',
  'export interface PluginManifest',
  'export interface PluginOverrides',
  'export interface ProjectConfig',
  'export interface ConnectionConfig',
  'export interface ToolDef',
  'export interface ProviderConnectionConfig',
  'export interface KnowledgeNamespaceConfig',
  'export interface LayoutConfig',
  'export interface LayoutMetadata',
  'export interface LayoutAction',
  'export interface LayoutTab',
  'export interface LayoutPrompt',
  'export interface LayoutTemplate',
  'export interface LayoutDefinition',
  'export interface LayoutDefinitionMetadata',
  'export interface AuthStatus',
  'export interface ACPConnectionConfig',
  'export interface ACPConfig',
  'export interface RenewResult',
  'export interface UserIdentity',
  'export interface UserDetailVM',
  'export interface AppConfig',
  'export interface TemplateVariable',
  'export interface ToolCallResponse',
  'export interface AgentInvokeResponse',
  'export interface WorkflowMetadata',
  'export interface SessionMetadata',
  'export interface MemoryEvent',
  'export interface ConversationStats',
  'export enum AgentSwitchState',
  'export const BUILTIN_KNOWLEDGE_NAMESPACES',
]) {
  if (sharedTypes.includes(legacySharedDeclaration)) {
    errors.push(
      `packages/shared/src/types.ts must not inline ${legacySharedDeclaration}.`,
    );
  }
}

const contractsKnowledge = readFileSync(
  new URL('../packages/contracts/src/knowledge.ts', import.meta.url),
  'utf8',
);
if (!contractsKnowledge.includes('export const BUILTIN_KNOWLEDGE_NAMESPACES')) {
  errors.push(
    'packages/contracts/src/knowledge.ts must own BUILTIN_KNOWLEDGE_NAMESPACES.',
  );
}

const contractsLayout = readFileSync(
  new URL('../packages/contracts/src/layout.ts', import.meta.url),
  'utf8',
);
for (const retiredLayoutTypeName of [
  'StandaloneLayoutConfig',
  'StandaloneLayoutMetadata',
]) {
  if (contractsLayout.includes(retiredLayoutTypeName)) {
    errors.push(
      `packages/contracts/src/layout.ts must not retain retired layout type ${retiredLayoutTypeName}.`,
    );
  }
}

const sdkTsconfig = readFileSync(
  new URL('../packages/sdk/tsconfig.json', import.meta.url),
  'utf8',
);
if (!sdkTsconfig.includes('"moduleResolution": "bundler"')) {
  errors.push('packages/sdk/tsconfig.json must use bundler moduleResolution.');
}

for (const [relativePath, requiredImport] of [
  ['../packages/sdk/src/query-domains/catalog.ts', '@stallion-ai/contracts/catalog'],
  ['../packages/sdk/src/query-domains/systemRuntime.ts', '@stallion-ai/contracts/auth'],
  ['../packages/sdk/src/notifications/index.ts', '@stallion-ai/contracts/notification'],
  ['../packages/cli/src/commands/helpers.ts', '@stallion-ai/contracts/plugin'],
  ['../packages/cli/src/commands/install.ts', '@stallion-ai/contracts/plugin'],
  ['../packages/cli/src/dev/registry.ts', '@stallion-ai/contracts/layout'],
  ['../packages/sdk/src/query-domains/plugin-types.ts', '@stallion-ai/contracts/plugin'],
  ['../packages/sdk/src/types/index.ts', '@stallion-ai/contracts/runtime'],
  ['../packages/sdk/src/query-domains/workspaceConnections.ts', '@stallion-ai/contracts/tool'],
  ['../packages/sdk/src/query-domains/acpWorkspace.ts', '@stallion-ai/contracts/catalog'],
  ['../src-server/providers/resolver.ts', '@stallion-ai/contracts/plugin'],
  ['../src-server/routes/auth.ts', '@stallion-ai/contracts/auth'],
  ['../src-server/routes/acp.ts', '@stallion-ai/contracts/acp'],
  ['../src-server/routes/projects.ts', '@stallion-ai/contracts/plugin'],
  ['../src-server/services/acp-connection.ts', '@stallion-ai/contracts/acp'],
  ['../src-server/services/acp-connection.ts', './acp-bridge-types.js'],
  ['../src-server/services/acp-manager.ts', '@stallion-ai/contracts/acp'],
  ['../src-server/services/acp-probe.ts', '@stallion-ai/contracts/acp'],
  ['../src-server/services/agent-service.ts', '@stallion-ai/contracts/agent'],
  ['../src-server/services/prompt-scanner.ts', '@stallion-ai/contracts/catalog'],
  ['../src-server/services/knowledge-service.ts', '@stallion-ai/contracts/knowledge'],
  ['../src-server/services/project-service.ts', '@stallion-ai/contracts/knowledge'],
  ['../src-server/services/layout-service.ts', '@stallion-ai/contracts/runtime'],
  ['../src-server/services/mcp-service.ts', '@stallion-ai/contracts/tool'],
  ['../src-server/services/notification-service.ts', '@stallion-ai/contracts/notification'],
  ['../src-server/services/connection-service.ts', '@stallion-ai/contracts/acp'],
  ['../src-server/services/connection-service.ts', '@stallion-ai/contracts/tool'],
  ['../src-server/services/provider-service.ts', '@stallion-ai/contracts/config'],
  ['../src-server/routes/bedrock.ts', '@stallion-ai/contracts/config'],
  ['../src-server/domain/config-loader.ts', '@stallion-ai/contracts/acp'],
  ['../src-server/routes/enriched-agents.ts', '@stallion-ai/contracts/agent'],
  ['../src-server/routes/conversations.ts', '@stallion-ai/contracts/config'],
  ['../src-server/routes/invoke.ts', '@stallion-ai/contracts/agent'],
  ['../src-server/routes/plugin-loader.ts', '../providers/provider-interfaces.js'],
  ['../src-server/routes/plugin-source.ts', '../providers/provider-interfaces.js'],
  ['../src-server/domain/file-storage-adapter.ts', '@stallion-ai/contracts/layout'],
  ['../src-server/domain/storage-adapter.ts', '@stallion-ai/contracts/layout'],
  ['../src-server/providers/bedrock.ts', '@stallion-ai/contracts/config'],
  ['../src-server/providers/defaults.ts', '@stallion-ai/contracts/tool'],
  ['../src-server/providers/json-manifest-registry.ts', '@stallion-ai/contracts/tool'],
  ['../src-server/runtime/agent-hooks.ts', '@stallion-ai/contracts/agent'],
  ['../src-server/runtime/conversation-manager.ts', '@stallion-ai/contracts/config'],
  ['../src-server/runtime/mcp-manager.ts', '@stallion-ai/contracts/tool'],
  ['../src-server/runtime/stream-orchestrator.ts', '@stallion-ai/contracts/agent'],
  ['../src-server/runtime/strands-adapter.ts', '@stallion-ai/contracts/agent'],
  ['../src-server/routes/templates.ts', '@stallion-ai/contracts/layout'],
  ['../src-server/runtime/stallion-runtime.ts', '@stallion-ai/contracts/config'],
  ['../src-server/runtime/tool-executor.ts', '@stallion-ai/contracts/config'],
  ['../src-server/runtime/types.ts', '@stallion-ai/contracts/config'],
  ['../src-server/runtime/voltagent-adapter.ts', '@stallion-ai/contracts/agent'],
  ['../src-ui/src/types.ts', '@stallion-ai/contracts/config'],
  ['../src-ui/src/types.ts', '@stallion-ai/contracts/runtime'],
  ['../src-ui/src/hooks/useScheduler.ts', '@stallion-ai/contracts/scheduler'],
  ['../src-ui/src/utils/execution.ts', '@stallion-ai/contracts/tool'],
  ['../src-ui/src/views/ScheduleView.tsx', '@stallion-ai/contracts/scheduler'],
  ['../src-ui/src/components/scheduler/JobFormModal.tsx', '@stallion-ai/contracts/scheduler'],
]) {
  const fileContents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  if (!fileContents.includes(requiredImport)) {
    errors.push(`${relativePath} must import contract types from ${requiredImport}.`);
  }
  if (
    relativePath !== '../src-server/routes/plugins.ts' &&
    relativePath !== '../src-server/services/knowledge-service.ts' &&
    relativePath !== '../packages/cli/src/commands/helpers.ts' &&
    relativePath !== '../packages/cli/src/commands/install.ts' &&
    relativePath !== '../packages/cli/src/dev/server.ts' &&
    fileContents.includes("@stallion-ai/shared")
  ) {
    errors.push(`${relativePath} must not import contract-owned types from @stallion-ai/shared.`);
  }
}

const acpBridgeTypes = readFileSync(
  new URL('../src-server/services/acp-bridge-types.ts', import.meta.url),
  'utf8',
);
if (!acpBridgeTypes.includes('interface SessionUpdate')) {
  errors.push('acp-bridge-types.ts must own the ACP session update shape.');
}

const acpBridge = readFileSync(
  new URL('../src-server/services/acp-bridge.ts', import.meta.url),
  'utf8',
);
for (const requiredExport of [
  "export { ACPConnection, type ACPConnectionStatus } from './acp-connection.js';",
  "export { ACPManager } from './acp-manager.js';",
]) {
  if (!acpBridge.includes(requiredExport)) {
    errors.push(`acp-bridge.ts must remain a compatibility barrel exporting ${requiredExport}.`);
  }
}
for (const retiredInlineHandler of [
  'export class ACPConnection',
  'export class ACPManager',
  "case 'agent_message_chunk':",
  "case '_kiro.dev/commands/available':",
  "case '_kiro.dev/metadata':",
  'const promptContent: Array<',
  "const userId = options.userId || `agent:${slug}:user:${resolvedAlias}`;",
  'return Array.from(this.probes.entries()).flatMap',
  'private async handlePermissionRequest(',
  'private async handleCreateTerminal(',
  'private async findCommand(): Promise<string | null>',
  'private async detectModelFromCli(): Promise<void>',
  'const input = Writable.toWeb(proc.stdin!)',
  'protocolVersion: PROTOCOL_VERSION',
  'const waitingTimer = setInterval(async () => {',
  'const traceId = `acp:${slug}:',
  "this.connection!.extMethod('_kiro.dev/commands/execute'",
  "this.connection!.prompt({",
  'await this.connection.setSessionMode({',
  'await this.connection.setSessionConfigOption({',
  '} = resolveACPChatSession({',
  'await adapter.createConversation({',
  'this.sessionMap.set(conversationId, this.sessionId!)',
  'const probe = new ACPProbe(config, this.logger, this.cwd);',
  'const sessionCwd = context?.cwd || homedir();',
  'return this.modes.some((m) => `${this.prefix}-${m.id}` === slug);',
  "const modelOption = this.configOptions.find(",
  'forceKillProcess(',
  'this.approvalRegistry.cancelAll()',
  'terminal.process.kill()',
  'this.memoryAdapters.get(slug)',
  'this.createMemoryAdapter(slug)',
  "part.type === 'tool-invocation' && part.toolCallId === toolCallId",
  'responseParts.map((part) =>',
]) {
  if (acpBridge.includes(retiredInlineHandler)) {
    errors.push(`acp-bridge.ts must not inline extracted ACP event branch ${retiredInlineHandler}.`);
  }
}

const acpConnection = readFileSync(
  new URL('../src-server/services/acp-connection.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export type ACPConnectionStatus =',
  'export class ACPConnection',
  './acp-connection-chat.js',
  './acp-connection-event-controller.js',
  './acp-connection-event-state.js',
  './acp-connection-events.js',
  './acp-connection-lifecycle.js',
  './acp-connection-queries.js',
  './acp-connection-session.js',
  './acp-connection-state.js',
  './acp-connection-view.js',
]) {
  if (!acpConnection.includes(requiredHelper)) {
    errors.push(`acp-connection.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineAcpConnectionSnippet of [
  'return createACPBridgeClient({',
  'const state = this.buildEventState();',
  'handleACPBridgeExtensionNotification(method, params, {',
  'handleACPBridgeExtensionMethod(method, params, {',
  'handleACPBridgeSessionUpdate(params, {',
  'private buildEventState(): ACPBridgeEventState',
  'private syncEventState(state: ACPBridgeEventState)',
  "this.connection.extMethod('_kiro.dev/commands/options'",
  'await prepareACPChatTurn({',
  'return streamACPChatResponse(c, {',
  'const next = flushACPTextPart(',
  'updateACPToolResultState(',
  'private getEventFields(): ACPConnectionEventFields {',
  'private applyEventFields(fields: ACPConnectionEventFields): void {',
  'handleACPConnectionSessionUpdate(params, {',
  'handleACPConnectionExtensionNotification(method, params, {',
  'handleACPConnectionExtensionMethod(method, params, {',
  'getACPConnectionEventStateFields({',
  'applyACPConnectionEventStateFields(',
]) {
  if (acpConnection.includes(retiredInlineAcpConnectionSnippet)) {
    errors.push(`acp-connection.ts must not inline extracted ACP connection event logic ${retiredInlineAcpConnectionSnippet}.`);
  }
}

const acpConnectionEventController = readFileSync(
  new URL('../src-server/services/acp-connection-event-controller.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface ACPConnectionEventController',
  'export function createACPConnectionEventController',
  'export async function runACPConnectionSessionUpdate',
  'export function runACPConnectionExtensionNotification',
  'export function runACPConnectionExtensionMethod',
  './acp-connection-event-state.js',
  './acp-connection-events.js',
]) {
  if (!acpConnectionEventController.includes(requiredHelper)) {
    errors.push(`acp-connection-event-controller.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionChat = readFileSync(
  new URL('../src-server/services/acp-connection-chat.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function handleACPConnectionChat',
  'prepareACPChatTurn({',
  'streamACPChatResponse(c, {',
]) {
  if (!acpConnectionChat.includes(requiredHelper)) {
    errors.push(`acp-connection-chat.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionQueries = readFileSync(
  new URL('../src-server/services/acp-connection-queries.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getACPConnectionStatus',
  'export function getACPConnectionVirtualAgentViews',
  'export function getACPConnectionSlashCommands',
  'export async function getACPConnectionCommandOptions',
]) {
  if (!acpConnectionQueries.includes(requiredHelper)) {
    errors.push(`acp-connection-queries.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionSession = readFileSync(
  new URL('../src-server/services/acp-connection-session.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function isACPConnectionConnected',
  'export function isACPConnectionIdle',
  'export function isACPConnectionStale',
  'export async function loadACPConnectionSession',
]) {
  if (!acpConnectionSession.includes(requiredHelper)) {
    errors.push(`acp-connection-session.ts must include ${requiredHelper}.`);
  }
}

const knowledgeServiceSearch = readFileSync(
  new URL('../src-server/services/knowledge-service.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './knowledge-search.js',
  './knowledge-documents.js',
]) {
  if (!knowledgeServiceSearch.includes(requiredHelper)) {
    errors.push(`knowledge-service.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineKnowledgeSnippet of [
  'const [queryVector] = await embeddingProvider.embed([query]);',
  'allResults.sort((a, b) => b.score - a.score);',
]) {
  if (knowledgeServiceSearch.includes(retiredInlineKnowledgeSnippet)) {
    errors.push(`knowledge-service.ts must not inline extracted search helper ${retiredInlineKnowledgeSnippet}.`);
  }
}

const knowledgeSearch = readFileSync(
  new URL('../src-server/services/knowledge-search.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function searchKnowledgeDocuments',
  "candidate.behavior === 'rag'",
  'allResults.sort((left, right) => right.score - left.score);',
]) {
  if (!knowledgeSearch.includes(requiredHelper)) {
    errors.push(`knowledge-search.ts must include ${requiredHelper}.`);
  }
}

const acpManager = readFileSync(
  new URL('../src-server/services/acp-manager.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export class ACPManager',
  './acp-connection.js',
  './acp-manager-orchestration.js',
  './acp-manager-view.js',
  'new ACPConnection(',
  'getOrCreateACPManagerSession({',
]) {
  if (!acpManager.includes(requiredHelper)) {
    errors.push(`acp-manager.ts must include ${requiredHelper}.`);
  }
}

const acpBridgeEvents = readFileSync(
  new URL('../src-server/services/acp-bridge-events.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function handleACPBridgeSessionUpdate',
  'export function handleACPBridgeExtensionNotification',
  'export function handleACPBridgeExtensionMethod',
]) {
  if (!acpBridgeEvents.includes(requiredHelper)) {
    errors.push(`acp-bridge-events.ts must define ${requiredHelper}.`);
  }
}

const acpChatSession = readFileSync(
  new URL('../src-server/services/acp-chat-session.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function resolveACPChatSession',
  'export function createACPConversationTitle',
  'function parseACPChatInput',
]) {
  if (!acpChatSession.includes(requiredHelper)) {
    errors.push(`acp-chat-session.ts must include ${requiredHelper}.`);
  }
}

const acpManagerView = readFileSync(
  new URL('../src-server/services/acp-manager-view.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getACPManagerVirtualAgents',
  'export function getACPManagerStatus',
  'export function findACPConfigIdForSlug',
]) {
  if (!acpManagerView.includes(requiredHelper)) {
    errors.push(`acp-manager-view.ts must include ${requiredHelper}.`);
  }
}

const acpBridgeClient = readFileSync(
  new URL('../src-server/services/acp-bridge-client.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createACPBridgeClient',
  'export async function handleACPBridgePermissionRequest',
  'export async function handleACPBridgeCreateTerminal',
  "@agentclientprotocol/sdk",
]) {
  if (!acpBridgeClient.includes(requiredHelper)) {
    errors.push(`acp-bridge-client.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionLifecycle = readFileSync(
  new URL('../src-server/services/acp-connection-lifecycle.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function findACPCommand',
  'export async function detectACPModelFromCli',
  'export async function initializeACPConnectionProcess',
  "protocolVersion: PROTOCOL_VERSION",
]) {
  if (!acpConnectionLifecycle.includes(requiredHelper)) {
    errors.push(`acp-connection-lifecycle.ts must include ${requiredHelper}.`);
  }
}

const acpChatStream = readFileSync(
  new URL('../src-server/services/acp-chat-stream.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildACPCommandExecutionPayload',
  'export function markACPInterruptedToolCalls',
  'export function buildACPAgentStartEvent',
  'export function buildACPAgentCompleteEvent',
  'export function streamACPChatResponse',
  ".extMethod('_kiro.dev/commands/execute'",
]) {
  if (!acpChatStream.includes(requiredHelper)) {
    errors.push(`acp-chat-stream.ts must include ${requiredHelper}.`);
  }
}

const acpChatPreparation = readFileSync(
  new URL('../src-server/services/acp-chat-preparation.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function resolveACPRequestedModeId',
  'export function findACPModelConfigToUpdate',
  'export async function prepareACPChatTurn',
  'resolveACPChatSession({',
  'createACPConversationTitle(',
]) {
  if (!acpChatPreparation.includes(requiredHelper)) {
    errors.push(`acp-chat-preparation.ts must include ${requiredHelper}.`);
  }
}

const acpManagerOrchestration = readFileSync(
  new URL('../src-server/services/acp-manager-orchestration.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function runACPManagerProbes',
  'export async function sweepACPManagerIdleSessions',
  'export async function addACPManagerConnection',
  'export async function removeACPManagerConnection',
  'export async function reconnectACPManagerConnection',
  'export async function shutdownACPManager',
  'export function getOrCreateACPManagerSession',
]) {
  if (!acpManagerOrchestration.includes(requiredHelper)) {
    errors.push(`acp-manager-orchestration.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionView = readFileSync(
  new URL('../src-server/services/acp-connection-view.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function hasACPConnectionAgent',
  'export function getACPCurrentModelName',
  'export function getACPConnectionVirtualAgents',
  'export function getACPConnectionStatusView',
]) {
  if (!acpConnectionView.includes(requiredHelper)) {
    errors.push(`acp-connection-view.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionState = readFileSync(
  new URL('../src-server/services/acp-connection-state.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function flushACPTextPart',
  'export function updateACPToolResultState',
  'export function getOrCreateACPAdapter',
  'export function syncACPEventState',
  'export function cleanupACPConnectionState',
  'forceKillProcess(proc).catch(() => {})',
  'approvalOps.add(cancelled, { operation: \'cancel-cleanup\' })',
]) {
  if (!acpConnectionState.includes(requiredHelper)) {
    errors.push(`acp-connection-state.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionEventState = readFileSync(
  new URL('../src-server/services/acp-connection-event-state.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface ACPConnectionEventState',
  'export function getACPConnectionEventStateFields',
  'export function applyACPConnectionEventStateFields',
  'export function flushACPConnectionTextPart',
  'export function updateACPConnectionToolResult',
  './acp-connection-state.js',
  './acp-connection-events.js',
]) {
  if (!acpConnectionEventState.includes(requiredHelper)) {
    errors.push(`acp-connection-event-state.ts must include ${requiredHelper}.`);
  }
}

const acpConnectionEvents = readFileSync(
  new URL('../src-server/services/acp-connection-events.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildACPConnectionEventState',
  'export function applyACPConnectionEventState',
  'export async function handleACPConnectionSessionUpdate',
  'export function handleACPConnectionExtensionNotification',
  'export function handleACPConnectionExtensionMethod',
  'export function createACPConnectionClient',
  './acp-bridge-client.js',
  './acp-bridge-events.js',
]) {
  if (!acpConnectionEvents.includes(requiredHelper)) {
    errors.push(`acp-connection-events.ts must include ${requiredHelper}.`);
  }
}

const stallionRuntime = readFileSync(
  new URL('../src-server/runtime/stallion-runtime.ts', import.meta.url),
  'utf8',
);
if (!stallionRuntime.includes('./runtime-event-log.js')) {
  errors.push('stallion-runtime.ts must delegate event log persistence to runtime-event-log.ts.');
}
for (const retiredInlineRuntimeMethod of [
  'private getTodayEventLogPath(): string {',
  'private async queryEventsFromDisk(',
  'private async loadEventsFromDisk(): Promise<void> {',
  'private async persistEvent(event: any): Promise<void> {',
]) {
  if (stallionRuntime.includes(retiredInlineRuntimeMethod)) {
    errors.push(`stallion-runtime.ts must not inline extracted event log method ${retiredInlineRuntimeMethod}.`);
  }
}

const runtimeEventLog = readFileSync(
  new URL('../src-server/runtime/runtime-event-log.ts', import.meta.url),
  'utf8',
);
const runtimeInitialize = readFileSync(
  new URL('../src-server/runtime/runtime-initialize.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export class RuntimeEventLog',
  'async queryEvents(',
  'async loadRecentEvents(): Promise<void>',
  'async persist(event: any): Promise<void>',
]) {
  if (!runtimeEventLog.includes(requiredHelper)) {
    errors.push(`runtime-event-log.ts must define ${requiredHelper}.`);
  }
}

if (
  !stallionRuntime.includes('./runtime-plugin-assets.js') &&
  !runtimeInitialize.includes('./runtime-plugin-assets.js')
) {
  errors.push('stallion-runtime.ts must delegate plugin asset loading orchestration to runtime-plugin-assets.ts.');
}
for (const retiredInlinePluginSnippet of [
  'const pluginsDir = join(this.configLoader.getProjectHomeDir(), \'plugins\');',
  'const { resolvePluginProviders } = await import(\'../providers/resolver.js\');',
  'const { scanPromptDir } = await import(\'../services/prompt-scanner.js\');',
]) {
  if (stallionRuntime.includes(retiredInlinePluginSnippet)) {
    errors.push(`stallion-runtime.ts must not inline plugin-loading code ${retiredInlinePluginSnippet}.`);
  }
}

const runtimePluginLoader = readFileSync(
  new URL('../src-server/runtime/runtime-plugin-loader.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function loadRuntimePluginPrompts',
  'export async function loadRuntimePluginProviders',
  "../providers/resolver.js",
  "../services/prompt-scanner.js",
]) {
  if (!runtimePluginLoader.includes(requiredHelper)) {
    errors.push(`runtime-plugin-loader.ts must define or import ${requiredHelper}.`);
  }
}

const runtimePluginAssets = readFileSync(
  new URL('../src-server/runtime/runtime-plugin-assets.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function loadRuntimePluginAssets',
  './runtime-plugin-loader.js',
  'await loadProviders({',
  'await loadPrompts({',
]) {
  if (!runtimePluginAssets.includes(requiredHelper)) {
    errors.push(`runtime-plugin-assets.ts must include ${requiredHelper}.`);
  }
}

if (!stallionRuntime.includes('./runtime-health.js')) {
  errors.push('stallion-runtime.ts must delegate health-check orchestration to runtime-health.ts.');
}
if (
  !stallionRuntime.includes('./runtime-background-tasks.js') &&
  !runtimeInitialize.includes('./runtime-background-tasks.js')
) {
  errors.push('stallion-runtime.ts must delegate startup/background tasks to runtime-background-tasks.ts.');
}
if (
  !stallionRuntime.includes('./runtime-default-agent.js') &&
  !runtimeInitialize.includes('./runtime-default-agent.js')
) {
  errors.push('stallion-runtime.ts must delegate default-agent bootstrapping to runtime-default-agent.ts.');
}
if (!stallionRuntime.includes('./runtime-voice-agent.js')) {
  errors.push('stallion-runtime.ts must delegate voice-agent bootstrapping to runtime-voice-agent.ts.');
}
if (!stallionRuntime.includes('./runtime-context-builder.js')) {
  errors.push('stallion-runtime.ts must delegate runtime context assembly to runtime-context-builder.ts.');
}
if (!stallionRuntime.includes('./runtime-agent-builder.js')) {
  errors.push('stallion-runtime.ts must delegate agent construction to runtime-agent-builder.ts.');
}
if (!stallionRuntime.includes('./runtime-template-variables.js')) {
  errors.push('stallion-runtime.ts must delegate template-variable expansion to runtime-template-variables.ts.');
}
if (!stallionRuntime.includes('./runtime-agent-lifecycle.js')) {
  errors.push('stallion-runtime.ts must delegate agent reload/switch lifecycle to runtime-agent-lifecycle.ts.');
}
if (!stallionRuntime.includes('./runtime-provider-resolution.js')) {
  errors.push('stallion-runtime.ts must delegate framework model and provider resolution helpers to runtime-provider-resolution.ts.');
}
if (!stallionRuntime.includes('./runtime-service-bootstrap.js')) {
  errors.push('stallion-runtime.ts must delegate constructor service bootstrap to runtime-service-bootstrap.ts.');
}
if (!stallionRuntime.includes('./runtime-shutdown.js')) {
  errors.push('stallion-runtime.ts must delegate shutdown orchestration to runtime-shutdown.ts.');
}
if (
  !stallionRuntime.includes('./runtime-startup.js') &&
  !runtimeInitialize.includes('./runtime-startup.js')
) {
  errors.push('stallion-runtime.ts must delegate startup preparation to runtime-startup.ts.');
}
if (!stallionRuntime.includes('./runtime-routes.js')) {
  errors.push('stallion-runtime.ts must delegate HTTP route composition to runtime-routes.ts.');
}
if (
  !stallionRuntime.includes('./runtime-agent-registry.js') &&
  !runtimeInitialize.includes('./runtime-agent-registry.js')
) {
  errors.push('stallion-runtime.ts must delegate dynamic agent initialization to runtime-agent-registry.ts.');
}
for (const retiredInlineRuntimeSnippet of [
  'const checks: Record<string, boolean> = {',
  'userId: getCachedUser().alias',
  'const rawSystemPrompt = this.appConfig.systemPrompt ||',
  'const bundle = await this.framework.createAgent(',
  'const builtInReplacements: Record<string, string> = {',
  'const customReplacements: Record<string, string> = {}',
  'app.onError((err, c) => {',
  "app.use('*', async (c, next) => {",
  'const allowed = process.env.ALLOWED_ORIGINS?.split',
  "You are Stallion Voice, a hands-free voice assistant.",
  "const selfIntegrationId = 'stallion-control';",
  "Failed to load stallion-control tools for default agent",
  "Plugin updates available",
  "const msUntilMidnight = () => {",
  "const projects = this.storageAdapter?.listProjects() || [];",
  "const activeProject = projects[0]?.slug;",
  "const overrides = await this.configLoader.loadPluginOverrides();",
  "overrides['aws-internal']?.settings?.disableDefaultSkillRegistries",
  "new UsageAggregator(",
  'await runStartupMigrations(this.configLoader.getProjectHomeDir());',
  "this.storageAdapter.listProviderConnections()",
  "Seeded default Bedrock provider connection",
  "app.route('/api/models', modelsRoute);",
  "createSystemRoutes(",
  "createPluginRoutes(",
  "createConversationRoutes(",
  'new SchedulerService(this.logger)',
  'new NotificationService(',
  'const currentSlugs = new Set(agentMetadataList.map((m) => m.slug));',
  "this.eventBus.emit('agents:changed', { count: agentMetadataList.length });",
  'const savedDefaultMeta = this.agentMetadataMap.get(\'default\');',
  'this.agentMetadataMap = new Map(',
  'const activeProject = getActiveRuntimeProjectSlug(this.storageAdapter);',
  "this.logger.info('Switching agent', { from: 'current', to: targetSlug });",
  'new FileStorageAdapter(',
  'new AgentService(',
  'new SkillService(',
  'new MCPService(',
  'new LayoutService(',
  'new ProjectService(',
  'new ProviderService(',
  'new KnowledgeService(',
  'new FileTreeService(',
  'new NodePtyAdapter(',
  'new FileTerminalHistoryStore(',
  'new TerminalService(',
  'new TerminalWebSocketServer(',
  'new VoiceSessionService(',
  'new MonitoringEmitter(',
  'new ACPManager(',
  'new ConnectionService(',
  'new FeedbackService(',
  "this.logger.info('Shutting down Stallion Runtime...')",
  'await this.schedulerService.stop();',
  'await this.acpBridge.shutdown();',
  'await this.voiceService.stop();',
  'await this.terminalService.dispose();',
  "this.logger.info('Shutdown complete')",
  'private async createBedrockModel(',
  'private async loadPluginPrompts(): Promise<void>',
  'private async loadPluginProviders(): Promise<void>',
  'private resolveVectorDbProvider()',
  'private resolveEmbeddingProvider()',
]) {
  if (stallionRuntime.includes(retiredInlineRuntimeSnippet)) {
    errors.push(`stallion-runtime.ts must not inline extracted runtime helper logic ${retiredInlineRuntimeSnippet}.`);
  }
}

if (!stallionRuntime.includes('./runtime-initialize.js')) {
  errors.push('stallion-runtime.ts must delegate startup sequencing to runtime-initialize.ts.');
}
for (const requiredHelper of [
  'export async function initializeRuntime',
  './runtime-plugin-assets.js',
  './runtime-background-tasks.js',
  './runtime-default-agent.js',
  './runtime-startup.js',
  './runtime-agent-registry.js',
  './runtime-control-tools.js',
]) {
  if (!runtimeInitialize.includes(requiredHelper)) {
    errors.push(`runtime-initialize.ts must include ${requiredHelper}.`);
  }
}

const runtimeAgentRegistry = readFileSync(
  new URL('../src-server/runtime/runtime-agent-registry.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function initializeRuntimeAgents',
  'export function replaceRuntimeAgentMetadataMap',
  "context.logger.info('Found agents'",
  "agentMetadataMap.clear()",
]) {
  if (!runtimeAgentRegistry.includes(requiredHelper)) {
    errors.push(`runtime-agent-registry.ts must include ${requiredHelper}.`);
  }
}

const runtimeServiceBootstrap = readFileSync(
  new URL('../src-server/runtime/runtime-service-bootstrap.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createRuntimeServiceBundle',
  'new FileStorageAdapter(',
  'new AgentService(',
  'new SkillService(',
  'new MCPService(',
  'new LayoutService(',
  'new ProjectService(',
  'new ProviderService(',
  'new KnowledgeService(',
  'new FileTreeService(',
  'new NodePtyAdapter(',
  'new FileTerminalHistoryStore(',
  'new TerminalService(',
  'new TerminalWebSocketServer(',
  'terminalWsServer.start(context.port + 1);',
  'new VoiceSessionService(',
  'new MonitoringEmitter(',
  'new ACPManager(',
  'new ConnectionService(',
  'new FeedbackService(',
]) {
  if (!runtimeServiceBootstrap.includes(requiredHelper)) {
    errors.push(`runtime-service-bootstrap.ts must include ${requiredHelper}.`);
  }
}

const toolExecutor = readFileSync(
  new URL('../src-server/runtime/tool-executor.ts', import.meta.url),
  'utf8',
);
if (!toolExecutor.includes("./tool-approval.js")) {
  errors.push('tool-executor.ts must delegate approval matching and elicitation wrapping to tool-approval.ts.');
}
if (!toolExecutor.includes("./tool-execution-usage.js")) {
  errors.push('tool-executor.ts must delegate conversation usage persistence to tool-execution-usage.ts.');
}
if (!toolExecutor.includes("./usage-stats.js")) {
  errors.push('tool-executor.ts must delegate shared usage math to usage-stats.ts.');
}
for (const retiredInlineUsageSnippet of [
  'export async function calculateCost(',
  'export function calculateContextWindowPercentage(',
  'export function isAutoApproved(',
  'export function wrapToolWithElicitation(',
  "logger.info('[Usage Stats]'",
  "logger.info('[Token Breakdown]'",
  'await memory.updateConversation(',
  'otelContextTokens.add(',
  "logger.error('Failed to enrich message with model metadata'",
]) {
  if (toolExecutor.includes(retiredInlineUsageSnippet)) {
    errors.push(`tool-executor.ts must not inline shared usage helper ${retiredInlineUsageSnippet}.`);
  }
}

const toolApproval = readFileSync(
  new URL('../src-server/runtime/tool-approval.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function isAutoApproved',
  'export function wrapToolWithElicitation',
  "error: 'USER_DENIED'",
  "type: 'tool-approval'",
]) {
  if (!toolApproval.includes(requiredHelper)) {
    errors.push(`tool-approval.ts must include ${requiredHelper}.`);
  }
}

const toolExecutionUsage = readFileSync(
  new URL('../src-server/runtime/tool-execution-usage.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function recordToolExecutionUsage',
  "logger.info('[Usage Stats]'",
  "logger.info('[Token Breakdown]'",
  'await memory.updateConversation(',
  'otelContextTokens.add(',
  "logger.error('Failed to enrich message with model metadata'",
]) {
  if (!toolExecutionUsage.includes(requiredHelper)) {
    errors.push(`tool-execution-usage.ts must include ${requiredHelper}.`);
  }
}

const agentHooks = readFileSync(
  new URL('../src-server/runtime/agent-hooks.ts', import.meta.url),
  'utf8',
);
if (!agentHooks.includes("./usage-stats.js")) {
  errors.push('agent-hooks.ts must share runtime usage math through usage-stats.ts.');
}
if (agentHooks.includes('async function calculateCost(')) {
  errors.push('agent-hooks.ts must not inline calculateCost once usage-stats.ts exists.');
}

const conversationManager = readFileSync(
  new URL('../src-server/runtime/conversation-manager.ts', import.meta.url),
  'utf8',
);
if (!conversationManager.includes("./usage-stats.js")) {
  errors.push('conversation-manager.ts must share context window math through usage-stats.ts.');
}
if (conversationManager.includes('function calculateContextWindowPercentage(')) {
  errors.push('conversation-manager.ts must not inline calculateContextWindowPercentage once usage-stats.ts exists.');
}

const runtimeShutdown = readFileSync(
  new URL('../src-server/runtime/runtime-shutdown.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function shutdownRuntimeServices',
  "logger.info('Shutting down Stallion Runtime...')",
  'await schedulerService.stop();',
  'mcpConfigs.clear();',
  'activeAgents.clear();',
  'await acpBridge.shutdown();',
  'await voiceService.stop();',
  'await terminalService.dispose();',
  "logger.info('Shutdown complete')",
]) {
  if (!runtimeShutdown.includes(requiredHelper)) {
    errors.push(`runtime-shutdown.ts must include ${requiredHelper}.`);
  }
}

const runtimeProviderResolution = readFileSync(
  new URL('../src-server/runtime/runtime-provider-resolution.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function createRuntimeFrameworkModel',
  'export function resolveRuntimeVectorDbProvider',
  'export function resolveRuntimeEmbeddingProvider',
  '../providers/connection-factories.js',
  'options.framework.createModel(',
]) {
  if (!runtimeProviderResolution.includes(requiredHelper)) {
    errors.push(`runtime-provider-resolution.ts must include ${requiredHelper}.`);
  }
}

const strandsAdapter = readFileSync(
  new URL('../src-server/runtime/strands-adapter.ts', import.meta.url),
  'utf8',
);
if (!strandsAdapter.includes('./strands-stream-events.js')) {
  errors.push('strands-adapter.ts must delegate stream event mapping to strands-stream-events.ts.');
}
if (
  !strandsAdapter.includes('./strands-message-sync.js') &&
  !strandsAdapter.includes('./strands-agent-hooks.js')
) {
  errors.push('Strands message persistence sync must stay delegated out of strands-adapter.ts.');
}
if (!strandsAdapter.includes('./strands-tool-loader.js')) {
  errors.push('strands-adapter.ts must delegate MCP tool loading to strands-tool-loader.ts.');
}
if (!strandsAdapter.includes('./strands-agent-hooks.js')) {
  errors.push('strands-adapter.ts must delegate Strands hook wiring to strands-agent-hooks.ts.');
}
for (const retiredInlineStrandsSnippet of [
  "if (event.type === 'modelStreamUpdateEvent') {",
  "if (event.type === 'toolResultEvent') {",
  'const existing = await memoryAdapter.getMessages(',
  'const delta = agentMessages.slice(existing?.length || 0);',
  'for (const block of msg.content || []) {',
  'strandsAgent.hooks.addCallback(BeforeToolCallEvent',
  'strandsAgent.hooks.addCallback(AfterToolCallEvent',
  'strandsAgent.hooks.addCallback(AfterInvocationEvent',
  'new McpClient({',
]) {
  if (strandsAdapter.includes(retiredInlineStrandsSnippet)) {
    errors.push(`strands-adapter.ts must not inline extracted Strands helper logic ${retiredInlineStrandsSnippet}.`);
  }
}

const strandsStreamEvents = readFileSync(
  new URL('../src-server/runtime/strands-stream-events.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function mapStrandsStreamEvent',
  "if (event.type === 'modelStreamUpdateEvent') {",
  "if (event.type === 'toolResultEvent') {",
]) {
  if (!strandsStreamEvents.includes(requiredHelper)) {
    errors.push(`strands-stream-events.ts must include ${requiredHelper}.`);
  }
}

const strandsMessageSync = readFileSync(
  new URL('../src-server/runtime/strands-message-sync.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function mapStrandsContentBlocksToParts',
  'export async function syncStrandsMessagesToMemory',
  'const delta = agentMessages.slice(existing?.length || 0);',
  'await memoryAdapter.addMessage(',
]) {
  if (!strandsMessageSync.includes(requiredHelper)) {
    errors.push(`strands-message-sync.ts must include ${requiredHelper}.`);
  }
}

const strandsToolLoader = readFileSync(
  new URL('../src-server/runtime/strands-tool-loader.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createStrandsFunctionTools',
  'export function applyStrandsAvailableToolFilter',
  'export async function loadStrandsTools',
  'export async function destroyStrandsAgentTools',
  'new McpClient({',
  'new StdioClientTransport({',
]) {
  if (!strandsToolLoader.includes(requiredHelper)) {
    errors.push(`strands-tool-loader.ts must include ${requiredHelper}.`);
  }
}

const strandsAgentHooks = readFileSync(
  new URL('../src-server/runtime/strands-agent-hooks.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function wireStrandsAgentHooks',
  'BeforeToolCallEvent',
  'AfterToolCallEvent',
  'AfterInvocationEvent',
  'syncStrandsMessagesToMemory',
]) {
  if (!strandsAgentHooks.includes(requiredHelper)) {
    errors.push(`strands-agent-hooks.ts must include ${requiredHelper}.`);
  }
}

const runtimeStartup = readFileSync(
  new URL('../src-server/runtime/runtime-startup.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getActiveRuntimeProjectSlug',
  'export function shouldRegisterRuntimeDefaultSkillRegistry',
  'export function initializeRuntimeUsageAggregator',
  'export async function seedRuntimeDefaultProviderConnection',
  'export async function prepareRuntimeStartup',
  "pluginOverrides['aws-internal']?.settings?.disableDefaultSkillRegistries",
  "type: 'bedrock'",
]) {
  if (!runtimeStartup.includes(requiredHelper)) {
    errors.push(`runtime-startup.ts must define or include ${requiredHelper}.`);
  }
}

const runtimeRoutes = readFileSync(
  new URL('../src-server/runtime/runtime-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function configureRuntimeRoutes',
  "./runtime-http.js",
  "./runtime-route-support.js",
  'createRuntimeSystemRouteDeps(context)',
  'configureRuntimeSupportServices(context)',
  'createPluginRoutes(',
  'createConversationRoutes(',
]) {
  if (!runtimeRoutes.includes(requiredHelper)) {
    errors.push(`runtime-routes.ts must define or include ${requiredHelper}.`);
  }
}
for (const retiredInlineRuntimeRoutesSnippet of [
  'const schedulerService = new SchedulerService(',
  'const notificationService = new NotificationService(',
  'context.providerService.listProviderConnections().map(',
]) {
  if (runtimeRoutes.includes(retiredInlineRuntimeRoutesSnippet)) {
    errors.push(`runtime-routes.ts must not inline extracted runtime support logic ${retiredInlineRuntimeRoutesSnippet}.`);
  }
}

const runtimeRouteSupport = readFileSync(
  new URL('../src-server/runtime/runtime-route-support.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createRuntimeSystemRouteDeps',
  'export function configureRuntimeSupportServices',
  'new SchedulerService(',
  'new NotificationService(',
  'getNotificationProviders()',
  'checkOllamaAvailability: context.checkOllamaAvailability',
]) {
  if (!runtimeRouteSupport.includes(requiredHelper)) {
    errors.push(`runtime-route-support.ts must define or include ${requiredHelper}.`);
  }
}

const mcpManager = readFileSync(
  new URL('../src-server/runtime/mcp-manager.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './mcp-tool-names.js',
  'normalizeLoadedMCPTools(',
  'matchMCPToolPattern(',
  'resolveOriginalToolName(',
  'resolveNormalizedToolName(',
]) {
  if (!mcpManager.includes(requiredHelper)) {
    errors.push(`mcp-manager.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineMcpManagerSnippet of [
  'const normalized = normalizeToolName(tool.name);',
  'const parsed = parseToolName(tool.name);',
  "if (pattern.endsWith('_*')) {",
  "if (pattern.endsWith('/*')) {",
  'const mapping = toolNameMapping.get(normalizedName);',
  'return toolNameReverseMapping.get(originalName) || originalName;',
]) {
  if (mcpManager.includes(retiredInlineMcpManagerSnippet)) {
    errors.push(`mcp-manager.ts must not inline extracted MCP name helper logic ${retiredInlineMcpManagerSnippet}.`);
  }
}

const mcpToolNames = readFileSync(
  new URL('../src-server/runtime/mcp-tool-names.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface MCPToolNameMappingEntry',
  'export function normalizeLoadedMCPTools',
  'export function matchesToolPattern',
  'export function getOriginalToolName',
  'export function getNormalizedToolName',
  'normalizeToolName(',
  'parseToolName(',
]) {
  if (!mcpToolNames.includes(requiredHelper)) {
    errors.push(`mcp-tool-names.ts must define or include ${requiredHelper}.`);
  }
}

const runtimeHealth = readFileSync(
  new URL('../src-server/runtime/runtime-health.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function runRuntimeHealthChecks',
  'export function startRuntimeHealthChecks',
  '../routes/auth.js',
  'emitHealth(',
]) {
  if (!runtimeHealth.includes(requiredHelper)) {
    errors.push(`runtime-health.ts must include ${requiredHelper}.`);
  }
}

const runtimeHttp = readFileSync(
  new URL('../src-server/runtime/runtime-http.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function configureRuntimeHttp',
  'export function resolveRuntimeCorsOrigin',
  "from 'hono/cors'",
  '../utils/auth-errors.js',
]) {
  if (!runtimeHttp.includes(requiredHelper)) {
    errors.push(`runtime-http.ts must include ${requiredHelper}.`);
  }
}

const runtimeContextBuilder = readFileSync(
  new URL('../src-server/runtime/runtime-context-builder.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildRuntimeContext',
  "import type { RuntimeContext } from './types.js';",
]) {
  if (!runtimeContextBuilder.includes(requiredHelper)) {
    errors.push(`runtime-context-builder.ts must include ${requiredHelper}.`);
  }
}

const runtimeAgentBuilder = readFileSync(
  new URL('../src-server/runtime/runtime-agent-builder.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function buildRuntimeAgentInstance',
  'createAgentHooks',
  'FileMemoryAdapter',
  'function applyRuntimeAgentBundle',
]) {
  if (!runtimeAgentBuilder.includes(requiredHelper)) {
    errors.push(`runtime-agent-builder.ts must include ${requiredHelper}.`);
  }
}

const runtimeAgentLifecycle = readFileSync(
  new URL('../src-server/runtime/runtime-agent-lifecycle.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function reloadRuntimeAgents',
  'export async function reloadRuntimeSkillsAndAgents',
  'export async function switchRuntimeAgent',
  'getActiveRuntimeProjectSlug',
]) {
  if (!runtimeAgentLifecycle.includes(requiredHelper)) {
    errors.push(`runtime-agent-lifecycle.ts must include ${requiredHelper}.`);
  }
}

const runtimeTemplateVariables = readFileSync(
  new URL('../src-server/runtime/runtime-template-variables.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function replaceRuntimeTemplateVariables',
  "../routes/auth.js",
  'function getBuiltInTemplateVariables',
  'function getCustomTemplateVariables',
]) {
  if (!runtimeTemplateVariables.includes(requiredHelper)) {
    errors.push(`runtime-template-variables.ts must include ${requiredHelper}.`);
  }
}

const runtimeVoiceAgent = readFileSync(
  new URL('../src-server/runtime/runtime-voice-agent.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createRuntimeVoiceAgentSpec',
  'export async function bootstrapRuntimeVoiceAgent',
  "const STALLION_VOICE_PROMPT",
]) {
  if (!runtimeVoiceAgent.includes(requiredHelper)) {
    errors.push(`runtime-voice-agent.ts must include ${requiredHelper}.`);
  }
}

const runtimeDefaultAgent = readFileSync(
  new URL('../src-server/runtime/runtime-default-agent.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createRuntimeSelfIntegration',
  'export async function bootstrapRuntimeDefaultAgent',
  "const selfIntegrationId = 'stallion-control';",
]) {
  if (!runtimeDefaultAgent.includes(requiredHelper)) {
    errors.push(`runtime-default-agent.ts must include ${requiredHelper}.`);
  }
}

const runtimeBackgroundTasks = readFileSync(
  new URL('../src-server/runtime/runtime-background-tasks.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function mergeRuntimeACPConnections',
  'export function scheduleRuntimeDailyReload',
  'export function startRuntimeACPConnections',
  'export function scheduleRuntimePluginUpdateCheck',
]) {
  if (!runtimeBackgroundTasks.includes(requiredHelper)) {
    errors.push(`runtime-background-tasks.ts must include ${requiredHelper}.`);
  }
}

const knowledgeService = readFileSync(
  new URL('../src-server/services/knowledge-service.ts', import.meta.url),
  'utf8',
);
if (!knowledgeService.includes('./knowledge-context.js')) {
  errors.push('knowledge-service.ts must delegate context/retrieval helpers to knowledge-context.ts.');
}
if (!knowledgeService.includes('./knowledge-namespaces.js')) {
  errors.push('knowledge-service.ts must delegate namespace/storage helpers to knowledge-namespaces.ts.');
}
if (!knowledgeService.includes('./knowledge-filesystem.js')) {
  errors.push('knowledge-service.ts must delegate filesystem/listing helpers to knowledge-filesystem.ts.');
}
if (!knowledgeService.includes('./knowledge-documents.js')) {
  errors.push('knowledge-service.ts must delegate document CRUD helpers to knowledge-documents.ts.');
}
for (const retiredInlineKnowledgeSnippet of [
  "const relevant = results.filter((r) => r.score >= threshold);",
  "const sections: string[] = [];",
  'const byDoc = new Map<',
  'const seen = new Set<string>();',
  "throw new Error(`Cannot remove built-in namespace '${namespaceId}'`);",
  'const buildTree = (dir: string, relPath: string): KnowledgeTreeNode => {',
  'const allowedExts = extensions',
  'const filtered = this.applyPatterns(',
  'private applyPatterns(',
  'private collectFiles(',
  'const ns = knowledgeVectorNamespace(projectSlug, namespace);',
  'const fileContent = readKnowledgeFile(storageDir, filePath);',
  'const oldChunkIds = Array.from(',
]) {
  if (knowledgeService.includes(retiredInlineKnowledgeSnippet)) {
    errors.push(
      `knowledge-service.ts must not inline extracted knowledge helper logic ${retiredInlineKnowledgeSnippet}.`,
    );
  }
}

const knowledgeContext = readFileSync(
  new URL('../src-server/services/knowledge-context.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildKnowledgeRagContext',
  'export async function buildKnowledgeInjectContext',
  'export function findKnowledgeDocumentNamespace',
  'loadKnowledgeMeta',
  'knowledgeVectorNamespace',
]) {
  if (!knowledgeContext.includes(requiredHelper)) {
    errors.push(`knowledge-context.ts must include ${requiredHelper}.`);
  }
}

const knowledgeNamespaces = readFileSync(
  new URL('../src-server/services/knowledge-namespaces.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function listKnowledgeNamespaces',
  'export function getKnowledgeNamespaceConfig',
  'export function resolveKnowledgeStorageDir',
  'export function registerKnowledgeNamespace',
  'export function removeKnowledgeNamespace',
  'export function updateKnowledgeNamespace',
]) {
  if (!knowledgeNamespaces.includes(requiredHelper)) {
    errors.push(`knowledge-namespaces.ts must include ${requiredHelper}.`);
  }
}

const knowledgeDocuments = readFileSync(
  new URL('../src-server/services/knowledge-documents.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function uploadKnowledgeDocument',
  'export async function deleteKnowledgeDocument',
  'export async function getKnowledgeDocumentContent',
  'export async function updateKnowledgeDocument',
  'knowledgeVectorNamespace(',
  'writeKnowledgeFile(',
  'readKnowledgeFile(',
]) {
  if (!knowledgeDocuments.includes(requiredHelper)) {
    errors.push(`knowledge-documents.ts must include ${requiredHelper}.`);
  }
}

const knowledgeFilesystem = readFileSync(
  new URL('../src-server/services/knowledge-filesystem.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function listKnowledgeDocuments',
  'export function buildKnowledgeDirectoryTree',
  'export async function scanKnowledgeDirectories',
  'function matchesKnowledgeFilter',
  'function collectKnowledgeFiles',
]) {
  if (!knowledgeFilesystem.includes(requiredHelper)) {
    errors.push(`knowledge-filesystem.ts must include ${requiredHelper}.`);
  }
}

const skillService = readFileSync(
  new URL('../src-server/services/skill-service.ts', import.meta.url),
  'utf8',
);
if (!skillService.includes('./skill-service-install.js')) {
  errors.push('skill-service.ts must delegate registry install/remove helpers to skill-service-install.ts.');
}
for (const retiredInlineSkillSnippet of [
  "const targetDir = projectSlug",
  "message: 'No skill registry configured'",
  "message: `No skill registry provider could install ${name}`",
  "message: `Skill '${name}' not found`",
  'await rm(targetDir, { recursive: true, force: true });',
]) {
  if (skillService.includes(retiredInlineSkillSnippet)) {
    errors.push(
      `skill-service.ts must not inline extracted skill install/remove logic ${retiredInlineSkillSnippet}.`,
    );
  }
}

const skillServiceInstall = readFileSync(
  new URL('../src-server/services/skill-service-install.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function installSkillFromRegistry',
  'export async function removeInstalledSkill',
  'No skill registry configured',
  "source: 'registry'",
]) {
  if (!skillServiceInstall.includes(requiredHelper)) {
    errors.push(`skill-service-install.ts must include ${requiredHelper}.`);
  }
}

const memoryAdapter = readFileSync(
  new URL('../src-server/adapters/file/memory-adapter.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './memory-adapter-conversations.js',
  './memory-adapter-messages.js',
  './memory-adapter-paths.js',
  './memory-adapter-state.js',
]) {
  if (!memoryAdapter.includes(requiredImport)) {
    errors.push(`memory-adapter.ts must delegate extracted helpers to ${requiredImport}.`);
  }
}
for (const requiredHelperCall of [
  'await addStoredMessage({',
  'await addStoredMessages({',
  'return readStoredMessages({',
  'await clearStoredMessages({',
  'await removeLastStoredMessage({',
]) {
  if (!memoryAdapter.includes(requiredHelperCall)) {
    errors.push(`memory-adapter.ts must delegate message operations through ${requiredHelperCall}.`);
  }
}
for (const retiredInlineMemoryHelper of [
  'private applyQueryOptions(',
  'private serializeWorkflowState(',
  'private deserializeWorkflowState(',
  'private getAgentsDir(): string {',
  'private getConversationPath(',
  'private getMessagesPath(',
  'private sanitizeId(',
  'const legacyPath = join(',
  'const payload = {',
  'const dir = this.paths.getWorkflowStatesDir();',
  "state.status === 'suspended' &&",
]) {
  if (memoryAdapter.includes(retiredInlineMemoryHelper)) {
    errors.push(
      `memory-adapter.ts must not inline extracted helper ${retiredInlineMemoryHelper}.`,
    );
  }
}

const memoryAdapterMessages = readFileSync(
  new URL('../src-server/adapters/file/memory-adapter-messages.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function addStoredMessage',
  'export async function addStoredMessages',
  'export async function readStoredMessages',
  'export async function clearStoredMessages',
  'export async function removeLastStoredMessage',
]) {
  if (!memoryAdapterMessages.includes(requiredHelper)) {
    errors.push(`memory-adapter-messages.ts must include ${requiredHelper}.`);
  }
}

const memoryAdapterPaths = readFileSync(
  new URL('../src-server/adapters/file/memory-adapter-paths.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export class MemoryAdapterPaths',
  'getAgentsDir(): string',
  'getConversationPath(resourceId: string, conversationId: string): string',
  'getMessagesPath(resourceId: string, conversationId: string): string',
  'sanitizeId(id: string): string',
]) {
  if (!memoryAdapterPaths.includes(requiredHelper)) {
    errors.push(`memory-adapter-paths.ts must include ${requiredHelper}.`);
  }
}

const memoryAdapterConversations = readFileSync(
  new URL('../src-server/adapters/file/memory-adapter-conversations.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function applyConversationQueryOptions',
  "const orderBy = options.orderBy ?? 'updated_at';",
  'return filtered.slice(offset, offset + limit);',
]) {
  if (!memoryAdapterConversations.includes(requiredHelper)) {
    errors.push(`memory-adapter-conversations.ts must include ${requiredHelper}.`);
  }
}

const memoryAdapterWorkflows = readFileSync(
  new URL('../src-server/adapters/file/memory-adapter-workflows.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export type WorkflowStateJson',
  'export function serializeWorkflowState',
  'export function deserializeWorkflowState',
  'suspendedAt: suspension.suspendedAt.toISOString()',
]) {
  if (!memoryAdapterWorkflows.includes(requiredHelper)) {
    errors.push(`memory-adapter-workflows.ts must include ${requiredHelper}.`);
  }
}

const memoryAdapterState = readFileSync(
  new URL('../src-server/adapters/file/memory-adapter-state.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function getWorkingMemoryState',
  'export async function setWorkingMemoryState',
  'export async function deleteWorkingMemoryState',
  'export async function getWorkflowStateEntry',
  'export async function setWorkflowStateEntry',
  'export async function getSuspendedWorkflowStateEntries',
]) {
  if (!memoryAdapterState.includes(requiredHelper)) {
    errors.push(`memory-adapter-state.ts must include ${requiredHelper}.`);
  }
}

for (const [relativePath, requiredImport] of [
  ['../src-server/services/llm-router.ts', '../providers/model-provider-types.js'],
  ['../src-server/services/provider-service.ts', '../providers/model-provider-types.js'],
  ['../src-server/services/knowledge-service.ts', '../providers/model-provider-types.js'],
  ['../src-server/services/prompt-service.ts', '../providers/provider-interfaces.js'],
  ['../src-server/services/notification-service.ts', '../providers/provider-interfaces.js'],
  ['../src-server/services/orchestration-service.ts', '../providers/provider-interfaces.js'],
  ['../src-server/services/orchestration-service.ts', '../providers/provider-contracts.js'],
  ['../src-server/services/prompt-scanner.ts', '@stallion-ai/contracts/catalog'],
  ['../src-server/services/scheduler-service.ts', '../providers/provider-interfaces.js'],
  ['../src-server/services/template-service.ts', '../providers/provider-interfaces.js'],
  ['../src-server/services/builtin-scheduler.ts', '../providers/provider-interfaces.js'],
  ['../src-server/services/builtin-scheduler.ts', '../providers/provider-contracts.js'],
  ['../src-server/providers/connection-factories.ts', './model-provider-types.js'],
  ['../src-server/providers/bedrock-llm-provider.ts', './model-provider-types.js'],
  ['../src-server/providers/bedrock-embedding-provider.ts', './model-provider-types.js'],
  ['../src-server/providers/lancedb-provider.ts', './model-provider-types.js'],
  ['../src-server/providers/ollama-provider.ts', './model-provider-types.js'],
  ['../src-server/providers/openai-compat-provider.ts', './model-provider-types.js'],
  ['../src-server/providers/github-skill-registry.ts', './provider-interfaces.js'],
  ['../src-server/providers/defaults.ts', './provider-interfaces.js'],
  ['../src-server/providers/json-manifest-registry.ts', './provider-interfaces.js'],
  ['../src-server/providers/registry.ts', './provider-interfaces.js'],
  ['../src-server/providers/registry.ts', './integration-registry-provider.js'],
  ['../src-server/providers/resolver.ts', './provider-interfaces.js'],
]) {
  const fileContents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  if (!fileContents.includes(requiredImport)) {
    errors.push(`${relativePath} must import from ${requiredImport}.`);
  }
}

const builtinScheduler = readFileSync(
  new URL('../src-server/services/builtin-scheduler.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  "from './builtin-scheduler-storage.js'",
  "from './builtin-scheduler-execution.js'",
  'appendSchedulerJobLog',
  'getStoredJobStats',
  'readStoredJobs',
  'executeSchedulerJobAttempt',
]) {
  if (!builtinScheduler.includes(requiredHelper)) {
    errors.push(`src-server/services/builtin-scheduler.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineSchedulerSnippet of [
  'const DATA_DIR = join(resolveHomeDir(), \'scheduler\');',
  'const JOBS_FILE = join(DATA_DIR, \'jobs.json\');',
  'const LOGS_DIR = join(DATA_DIR, \'logs\');',
  'const JOB_TIMEOUT = 10 * 60_000;',
  "event: 'job.completed'",
  "event: 'job.failed'",
  "event: 'job.retrying'",
]) {
  if (builtinScheduler.includes(retiredInlineSchedulerSnippet)) {
    errors.push(`src-server/services/builtin-scheduler.ts must not inline extracted scheduler storage logic ${retiredInlineSchedulerSnippet}.`);
  }
}

const builtinSchedulerStorage = readFileSync(
  new URL('../src-server/services/builtin-scheduler-storage.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export const SCHEDULER_DATA_DIR',
  'export function readStoredJobs',
  'export function appendSchedulerJobLog',
  'export function getStoredJobStats',
]) {
  if (!builtinSchedulerStorage.includes(requiredHelper)) {
    errors.push(`src-server/services/builtin-scheduler-storage.ts must include ${requiredHelper}.`);
  }
}

const builtinSchedulerExecution = readFileSync(
  new URL('../src-server/services/builtin-scheduler-execution.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function executeSchedulerJobAttempt',
  'const JOB_TIMEOUT = 10 * 60_000;',
  "event: 'job.completed'",
  "event: 'job.failed'",
  "event: 'job.retrying'",
]) {
  if (!builtinSchedulerExecution.includes(requiredHelper)) {
    errors.push(`src-server/services/builtin-scheduler-execution.ts must include ${requiredHelper}.`);
  }
}

const providerRegistry = readFileSync(
  new URL('../src-server/providers/registry.ts', import.meta.url),
  'utf8',
);
for (const retiredInlineProviderRegistrySnippet of [
  'function readDiskIntegrations(',
  'const diskItems = readDiskIntegrations();',
  'No provider could install command ${command}',
]) {
  if (providerRegistry.includes(retiredInlineProviderRegistrySnippet)) {
    errors.push(
      `src-server/providers/registry.ts must not inline extracted integration registry logic ${retiredInlineProviderRegistrySnippet}.`,
    );
  }
}

const integrationRegistryProvider = readFileSync(
  new URL('../src-server/providers/integration-registry-provider.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function readDiskIntegrations',
  'export function mergeRegistryItems',
  'export function createIntegrationRegistryProvider',
]) {
  if (!integrationRegistryProvider.includes(requiredHelper)) {
    errors.push(
      `src-server/providers/integration-registry-provider.ts must include ${requiredHelper}.`,
    );
  }
}

const routeSchemas = readFileSync(
  new URL('../src-server/routes/schemas.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  "export * from './schema-definitions.js';",
  "export * from './schema-validation.js';",
]) {
  if (!routeSchemas.includes(requiredHelper)) {
    errors.push(`src-server/routes/schemas.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineSchemaSnippet of [
  'export const acpConnectionSchema = z.object({',
  'export function validate<T>(schema: z.ZodSchema<T>)',
  'export function getBody(c: Context): any',
]) {
  if (routeSchemas.includes(retiredInlineSchemaSnippet)) {
    errors.push(`src-server/routes/schemas.ts must not inline extracted schema logic ${retiredInlineSchemaSnippet}.`);
  }
}

const routeSchemaDefinitions = readFileSync(
  new URL('../src-server/routes/schema-definitions.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  "export * from './schema-definitions/runtime.js';",
  "export * from './schema-definitions/scheduler.js';",
  "export * from './schema-definitions/content.js';",
  "export * from './schema-definitions/system.js';",
]) {
  if (!routeSchemaDefinitions.includes(requiredHelper)) {
    errors.push(`src-server/routes/schema-definitions.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineSchemaDefinition of [
  'export const acpConnectionSchema',
  'export const pluginInstallSchema',
  'export const skillCreateSchema',
  "import { validateCron } from '../services/cron.js';",
]) {
  if (routeSchemaDefinitions.includes(retiredInlineSchemaDefinition)) {
    errors.push(`src-server/routes/schema-definitions.ts must not inline extracted schema logic ${retiredInlineSchemaDefinition}.`);
  }
}

const routeRuntimeSchemas = readFileSync(
  new URL('../src-server/routes/schema-definitions/runtime.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export const acpConnectionSchema',
  'export const invokeSchema',
  'export const chatSchema',
  'export const providerSchema',
]) {
  if (!routeRuntimeSchemas.includes(requiredHelper)) {
    errors.push(`src-server/routes/schema-definitions/runtime.ts must include ${requiredHelper}.`);
  }
}

const routeSchedulerSchemas = readFileSync(
  new URL('../src-server/routes/schema-definitions/scheduler.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  "import { validateCron } from '../../services/cron.js';",
  'export const addJobSchema',
  'export const editJobSchema',
  'export const schedulerOpenSchema',
]) {
  if (!routeSchedulerSchemas.includes(requiredHelper)) {
    errors.push(`src-server/routes/schema-definitions/scheduler.ts must include ${requiredHelper}.`);
  }
}

const routeContentSchemas = readFileSync(
  new URL('../src-server/routes/schema-definitions/content.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export const promptCreateSchema',
  'export const projectCreateSchema',
  'export const agentCreateSchema',
  'export const templateCreateSchema',
]) {
  if (!routeContentSchemas.includes(requiredHelper)) {
    errors.push(`src-server/routes/schema-definitions/content.ts must include ${requiredHelper}.`);
  }
}

const routeSystemSchemas = readFileSync(
  new URL('../src-server/routes/schema-definitions/system.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export const notificationCreateSchema',
  'export const pluginInstallSchema',
  'export const feedbackDeleteSchema',
  'export const skillCreateSchema',
]) {
  if (!routeSystemSchemas.includes(requiredHelper)) {
    errors.push(`src-server/routes/schema-definitions/system.ts must include ${requiredHelper}.`);
  }
}

const routeSchemaValidation = readFileSync(
  new URL('../src-server/routes/schema-validation.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function validate<T>(schema: z.ZodSchema<T>)',
  'export function getBody(c: Context): any',
  'export function param(c: Context, name: string): string',
  'export function errorMessage(error: unknown): string',
]) {
  if (!routeSchemaValidation.includes(requiredHelper)) {
    errors.push(`src-server/routes/schema-validation.ts must include ${requiredHelper}.`);
  }
}

const knowledgeRoute = readFileSync(
  new URL('../src-server/routes/knowledge.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './knowledge-document-routes.js',
  './knowledge-cross-project.js',
  'createKnowledgeDocumentRoutes(',
  'createCrossProjectKnowledgeRouteHandlers(',
]) {
  if (!knowledgeRoute.includes(requiredHelper)) {
    errors.push(`src-server/routes/knowledge.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineKnowledgeSnippet of [
  'function knowledgeHandlers(',
  "app.get('/status', async (c) => {",
  "app.post('/search', validate(knowledgeSearchSchema), async (c) => {",
]) {
  if (knowledgeRoute.includes(retiredInlineKnowledgeSnippet)) {
    errors.push(`src-server/routes/knowledge.ts must not inline extracted knowledge route logic ${retiredInlineKnowledgeSnippet}.`);
  }
}

const knowledgeDocumentRoutes = readFileSync(
  new URL('../src-server/routes/knowledge-document-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createKnowledgeDocumentRoutes',
  'knowledgeBulkDeleteSchema',
  'knowledgeUploadSchema',
  'knowledgeOps.add(1, { op: \'search\' })',
]) {
  if (!knowledgeDocumentRoutes.includes(requiredHelper)) {
    errors.push(`src-server/routes/knowledge-document-routes.ts must include ${requiredHelper}.`);
  }
}

const knowledgeCrossProjectRoutes = readFileSync(
  new URL('../src-server/routes/knowledge-cross-project.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createCrossProjectKnowledgeRoutes',
  'providerService.listProviderConnections()',
  'knowledgeService.searchDocuments(',
  'storageAdapter.listProjects()',
]) {
  if (!knowledgeCrossProjectRoutes.includes(requiredHelper)) {
    errors.push(`src-server/routes/knowledge-cross-project.ts must include ${requiredHelper}.`);
  }
}

const invokeRoute = readFileSync(
  new URL('../src-server/routes/invoke.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './invoke-agent.js',
  './invoke-global.js',
  'invokeAgent(',
  'invokeAgentTool(',
  'invokeGlobalPrompt(',
]) {
  if (!invokeRoute.includes(requiredHelper)) {
    errors.push(`src-server/routes/invoke.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineInvokeSnippet of [
  'interface ToolResult {',
  'function unwrapMCPResult(',
  'const invokeModelId = model || ctx.appConfig.invokeModel;',
  "const tempConversationId = `invoke-${Date.now()}`;",
  "const filteredTools = toolIds.length > 0",
  'const toolResult = await (',
  ').execute(toolArgs);',
]) {
  if (invokeRoute.includes(retiredInlineInvokeSnippet)) {
    errors.push(`src-server/routes/invoke.ts must not inline extracted invoke route logic ${retiredInlineInvokeSnippet}.`);
  }
}

const invokeAgentRoute = readFileSync(
  new URL('../src-server/routes/invoke-agent.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function unwrapMCPResult',
  'export async function invokeAgent',
  'export async function invokeAgentTool',
  'export function invokeErrorResponse',
  'ctx.activeAgents.get(',
  'ctx.getNormalizedToolName(',
  'Response.json(',
]) {
  if (!invokeAgentRoute.includes(requiredHelper)) {
    errors.push(`src-server/routes/invoke-agent.ts must include ${requiredHelper}.`);
  }
}

const invokeGlobalRoute = readFileSync(
  new URL('../src-server/routes/invoke-global.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function invokeGlobalPrompt',
  'ctx.globalToolRegistry.get(id)',
  'ctx.framework.createTempAgent',
  'jsonSchema(schema)',
  'DEFAULT_SYSTEM_PROMPT',
]) {
  if (!invokeGlobalRoute.includes(requiredHelper)) {
    errors.push(`src-server/routes/invoke-global.ts must include ${requiredHelper}.`);
  }
}

const systemRoute = readFileSync(
  new URL('../src-server/routes/system.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './system-route-types.js',
  './system-status-routes.js',
  './system-update-routes.js',
  'createSystemStatusRoutes(deps)',
  'createSystemUpdateRoutes(deps, logger)',
]) {
  if (!systemRoute.includes(requiredHelper)) {
    errors.push(`src-server/routes/system.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineSystemSnippet of [
  'function normalizeConfiguredProviders(',
  'function buildCapabilityStates(',
  'function buildSystemRecommendation(',
  "app.get('/status', async (c) => {",
  "app.post('/verify-bedrock', async (c) => {",
  "app.get('/core-update', async (c) => {",
]) {
  if (systemRoute.includes(retiredInlineSystemSnippet)) {
    errors.push(`src-server/routes/system.ts must not inline extracted system route logic ${retiredInlineSystemSnippet}.`);
  }
}

const systemStatusRoutes = readFileSync(
  new URL('../src-server/routes/system-status-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createSystemStatusRoutes',
  'function normalizeConfiguredProviders(',
  'function buildCapabilityStates(',
  'function buildSystemRecommendation(',
  "app.get('/status', async (c) => {",
  "app.get('/capabilities', (c) => {",
  "app.get('/discover', (c) => {",
]) {
  if (!systemStatusRoutes.includes(requiredHelper)) {
    errors.push(`src-server/routes/system-status-routes.ts must include ${requiredHelper}.`);
  }
}

const systemUpdateRoutes = readFileSync(
  new URL('../src-server/routes/system-update-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createSystemUpdateRoutes',
  "app.post('/verify-bedrock', async (c) => {",
  "app.get('/core-update', async (c) => {",
  "app.post('/core-update', async (c) => {",
  'resolveGitInfo(',
  "spawn('node', ['dist-server/index.js']",
]) {
  if (!systemUpdateRoutes.includes(requiredHelper)) {
    errors.push(`src-server/routes/system-update-routes.ts must include ${requiredHelper}.`);
  }
}

const sdkTypesIndex = readFileSync(
  new URL('../packages/sdk/src/types/index.ts', import.meta.url),
  'utf8',
);
if (!sdkTypesIndex.includes('@stallion-ai/contracts/layout')) {
  errors.push('packages/sdk/src/types/index.ts must import layout types from @stallion-ai/contracts/layout.');
}

const cliDevServer = readFileSync(
  new URL('../packages/cli/src/dev/server.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './bundles.js',
  './http.js',
  './mcp.js',
  './registry.js',
  './watchers.js',
  'ensureDevAssetBundles(CWD)',
  'createDevHttpServer({',
  'setupDevMcpManager({',
  'regenerateDevHTML({',
  'watchSourceChanges({',
  'watchConfigChanges({',
]) {
  if (!cliDevServer.includes(requiredImport)) {
    errors.push(`packages/cli/src/dev/server.ts must include ${requiredImport}.`);
  }
}
for (const retiredInlineCliDevSnippet of [
  "import { execSync } from 'node:child_process';",
  "writeFileSync(",
  "serializeSDKMock",
  "import { generateDevHTML }",
  "const reactEntry = join(CWD, 'dist/.react-entry.mjs');",
  "const promptsSource = manifest.prompts?.source;",
  "const depRegistries: Record<string, any> = {};",
  'function readBody(',
  'const server = createServer(',
  'fsWatch(',
  'new MCPManager({',
  'resolvePluginIntegrations(',
]) {
  if (cliDevServer.includes(retiredInlineCliDevSnippet)) {
    errors.push(
      `packages/cli/src/dev/server.ts must not inline extracted dev-server logic ${retiredInlineCliDevSnippet}.`,
    );
  }
}

const cliLifecycle = readFileSync(
  new URL('../packages/cli/src/commands/lifecycle.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './lifecycle-doctor.js',
  "export { collectDoctorReport, doctor } from './lifecycle-doctor.js';",
]) {
  if (!cliLifecycle.includes(requiredImport)) {
    errors.push(`packages/cli/src/commands/lifecycle.ts must include ${requiredImport}.`);
  }
}
for (const retiredLifecycleSnippet of [
  'function execVersion(',
  'async function detectOllama(',
  'function doctorStatusSymbol(',
  "const awsCredentialsPath = join(homedir(), '.aws', 'credentials');",
]) {
  if (cliLifecycle.includes(retiredLifecycleSnippet)) {
    errors.push(
      `packages/cli/src/commands/lifecycle.ts must not inline extracted doctor logic ${retiredLifecycleSnippet}.`,
    );
  }
}

const cliLifecycleDoctor = readFileSync(
  new URL('../packages/cli/src/commands/lifecycle-doctor.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function collectDoctorReport',
  'export async function doctor',
  "const awsCredentialsPath = join(homedir(), '.aws', 'credentials');",
  "label: 'Configured chat providers'",
]) {
  if (!cliLifecycleDoctor.includes(requiredHelper)) {
    errors.push(`packages/cli/src/commands/lifecycle-doctor.ts must include ${requiredHelper}.`);
  }
}

const cliDevHttp = readFileSync(
  new URL('../packages/cli/src/dev/http.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  '@stallion-ai/contracts/runtime',
  'export function readBody',
  'export function parseToolCallResponse',
  'export function createDevHttpServer',
  'createServer(async (req, res) => {',
]) {
  if (!cliDevHttp.includes(requiredHelper)) {
    errors.push(`packages/cli/src/dev/http.ts must include ${requiredHelper}.`);
  }
}

const cliDevWatchers = readFileSync(
  new URL('../packages/cli/src/dev/watchers.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  '@stallion-ai/contracts/plugin',
  'export function watchSourceChanges',
  'export function getConfigWatchTargets',
  'export function watchConfigChanges',
]) {
  if (!cliDevWatchers.includes(requiredHelper)) {
    errors.push(`packages/cli/src/dev/watchers.ts must include ${requiredHelper}.`);
  }
}

const cliDevMcp = readFileSync(
  new URL('../packages/cli/src/dev/mcp.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function setupDevMcpManager',
  'resolvePluginIntegrations',
  'new MCPManager({',
]) {
  if (!cliDevMcp.includes(requiredHelper)) {
    errors.push(`packages/cli/src/dev/mcp.ts must include ${requiredHelper}.`);
  }
}

const cliDevBundles = readFileSync(
  new URL('../packages/cli/src/dev/bundles.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function resolveDevBundlePaths',
  'export function ensureDevAssetBundles',
  "window.__stallion_sdk",
  "window.__stallion_ai_rq",
]) {
  if (!cliDevBundles.includes(requiredHelper)) {
    errors.push(`packages/cli/src/dev/bundles.ts must include ${requiredHelper}.`);
  }
}

const cliDevRegistry = readFileSync(
  new URL('../packages/cli/src/dev/registry.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function parsePromptMarkdown',
  'export function loadPromptEntries',
  'export function regenerateDevHTML',
  'serializeSDKMock',
  'generateDevHTML',
]) {
  if (!cliDevRegistry.includes(requiredHelper)) {
    errors.push(`packages/cli/src/dev/registry.ts must include ${requiredHelper}.`);
  }
}

const cliDevTemplate = readFileSync(
  new URL('../packages/cli/src/dev/template.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './template-scripts.js',
  './template-styles.js',
  'export interface DevTemplateOptions',
  'export function generateDevHTML',
  'buildThemeBootstrapScript()',
  'buildDevSharedRuntimeScript(sdkMockJs)',
  'buildDevAppScript({ pluginName, tabsJson, registryJson })',
  'buildReloadScript()',
]) {
  if (!cliDevTemplate.includes(requiredHelper)) {
    errors.push(`packages/cli/src/dev/template.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineCliTemplateSnippet of [
  '.dev-banner{',
  'window.__stallion_ai_shared = {',
  'function InfoPage(){',
  'function LayoutView(props){',
  "var es=new EventSource('/api/reload')",
]) {
  if (cliDevTemplate.includes(retiredInlineCliTemplateSnippet)) {
    errors.push(
      `packages/cli/src/dev/template.ts must not inline extracted template helper ${retiredInlineCliTemplateSnippet}.`,
    );
  }
}

const cliDevTemplateStyles = readFileSync(
  new URL('../packages/cli/src/dev/template-styles.ts', import.meta.url),
  'utf8',
);
if (!cliDevTemplateStyles.includes('export const DEV_TEMPLATE_STYLES')) {
  errors.push(
    'packages/cli/src/dev/template-styles.ts must export DEV_TEMPLATE_STYLES.',
  );
}

const cliDevTemplateScripts = readFileSync(
  new URL('../packages/cli/src/dev/template-scripts.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildThemeBootstrapScript',
  'export function buildDevSharedRuntimeScript',
  'export interface DevAppScriptOptions',
  'export function buildDevAppScript',
  'export function buildReloadScript',
]) {
  if (!cliDevTemplateScripts.includes(requiredHelper)) {
    errors.push(
      `packages/cli/src/dev/template-scripts.ts must include ${requiredHelper}.`,
    );
  }
}

for (const deletedPath of [
  '../packages/shared/src/notifications.ts',
  '../packages/shared/src/scheduler.ts',
  '../src-server/domain/types.ts',
  '../src-server/providers/types.ts',
]) {
  if (existsSync(new URL(deletedPath, import.meta.url))) {
    errors.push(`${deletedPath.replace('../', '')} must be removed after contract extraction.`);
  }
}

const domainConfigLoader = readFileSync(
  new URL('../src-server/domain/config-loader.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  '@stallion-ai/contracts/config',
  '@stallion-ai/contracts/tool',
  './config-loader-app.js',
  './config-loader-agents.js',
  './config-loader-storage.js',
]) {
  if (!domainConfigLoader.includes(requiredImport)) {
    errors.push(`src-server/domain/config-loader.ts must import from ${requiredImport}.`);
  }
}
if (domainConfigLoader.includes("./types.js")) {
  errors.push('src-server/domain/config-loader.ts must not import from ./types.js.');
}
for (const retiredInlineConfigLoaderSnippet of [
  'Agent references missing workflows in ui.workflowShortcuts',
  'const workflowsDir = join(this.projectHomeDir, \'agents\', slug, \'workflows\')',
  'return agents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));',
  'const agentDir = join(this.projectHomeDir, \'agents\', slug);',
  'const integrationsDir = join(this.projectHomeDir, \'integrations\');',
  'const dir = join(this.projectHomeDir, \'skills\');',
  "const path = join(this.projectHomeDir, 'config', 'app.json');",
  "const path = join(this.projectHomeDir, 'config', 'acp.json');",
]) {
  if (domainConfigLoader.includes(retiredInlineConfigLoaderSnippet)) {
    errors.push(
      `src-server/domain/config-loader.ts must not inline extracted agent/workflow logic ${retiredInlineConfigLoaderSnippet}.`,
    );
  }
}

const domainConfigLoaderAgents = readFileSync(
  new URL('../src-server/domain/config-loader-agents.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function loadAgentConfig',
  'export async function saveAgentConfig',
  'export async function createAgentConfig',
  'export async function updateAgentConfig',
  'export async function listAgentConfigs',
  'export async function listAgentWorkflowMetadata',
  'export async function getAgentToolMap',
]) {
  if (!domainConfigLoaderAgents.includes(requiredHelper)) {
    errors.push(`src-server/domain/config-loader-agents.ts must include ${requiredHelper}.`);
  }
}

const domainConfigLoaderApp = readFileSync(
  new URL('../src-server/domain/config-loader-app.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export const DEFAULT_SYSTEM_PROMPT',
  'export async function loadAppConfigFile',
  'export async function saveAppConfigFile',
  'export async function updateAppConfigFile',
  'export function assertSafeAppConfig',
]) {
  if (!domainConfigLoaderApp.includes(requiredHelper)) {
    errors.push(`src-server/domain/config-loader-app.ts must include ${requiredHelper}.`);
  }
}

const domainConfigLoaderStorage = readFileSync(
  new URL('../src-server/domain/config-loader-storage.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function loadIntegrationConfig',
  'export async function saveIntegrationConfig',
  'export async function listIntegrationMetadata',
  'export async function listSkillConfigs',
  'export async function loadACPConfigFile',
  'export async function saveACPConfigFile',
]) {
  if (!domainConfigLoaderStorage.includes(requiredHelper)) {
    errors.push(`src-server/domain/config-loader-storage.ts must include ${requiredHelper}.`);
  }
}

const domainValidator = readFileSync(
  new URL('../src-server/domain/validator.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  '@stallion-ai/contracts/agent',
  '@stallion-ai/contracts/config',
  '@stallion-ai/contracts/tool',
]) {
  if (!domainValidator.includes(requiredImport)) {
    errors.push(`src-server/domain/validator.ts must import from ${requiredImport}.`);
  }
}
if (domainValidator.includes("./types.js")) {
  errors.push('src-server/domain/validator.ts must not import from ./types.js.');
}

const fileStorageAdapter = readFileSync(
  new URL('../src-server/domain/file-storage-adapter.ts', import.meta.url),
  'utf8',
);
if (!fileStorageAdapter.includes("./file-storage-helpers.js")) {
  errors.push('file-storage-adapter.ts must delegate shared filesystem helpers to file-storage-helpers.ts.');
}
for (const retiredInlineStorageSnippet of [
  'throw new Error(`Project not found for id: ${record.projectId}`);',
  "return JSON.parse(readFileSync(f, 'utf-8'));",
  "writeFileSync(f, JSON.stringify(records, null, 2), 'utf-8');",
]) {
  if (fileStorageAdapter.includes(retiredInlineStorageSnippet)) {
    errors.push(`file-storage-adapter.ts must not inline extracted storage helper ${retiredInlineStorageSnippet}.`);
  }
}

const fileStorageHelpers = readFileSync(
  new URL('../src-server/domain/file-storage-helpers.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function readJsonFile',
  'export function writeJsonFile',
  'export function listProjectSlugs',
  'export function resolveProjectSlugById',
]) {
  if (!fileStorageHelpers.includes(requiredHelper)) {
    errors.push(`file-storage-helpers.ts must include ${requiredHelper}.`);
  }
}

const sdkQueries = readFileSync(
  new URL('../packages/sdk/src/queries.ts', import.meta.url),
  'utf8',
);
const sdkIndex = readFileSync(
  new URL('../packages/sdk/src/index.ts', import.meta.url),
  'utf8',
);
const sdkApi = readFileSync(
  new URL('../packages/sdk/src/api.ts', import.meta.url),
  'utf8',
);
const sdkPluginsDomain = readFileSync(
  new URL('../packages/sdk/src/query-domains/plugins.ts', import.meta.url),
  'utf8',
);
const sdkPluginTypes = readFileSync(
  new URL('../packages/sdk/src/query-domains/plugin-types.ts', import.meta.url),
  'utf8',
);
const sdkPluginQueries = readFileSync(
  new URL('../packages/sdk/src/query-domains/plugin-queries.ts', import.meta.url),
  'utf8',
);
const sdkPluginMutations = readFileSync(
  new URL('../packages/sdk/src/query-domains/plugin-mutations.ts', import.meta.url),
  'utf8',
);
for (const domainExport of [
  "./query-domains/agentAdmin",
  "./query-domains/acpWorkspace",
  "./query-domains/analytics",
  "./query-domains/catalog",
  "./query-domains/chatRuntime",
  "./query-domains/plugins",
  "./query-domains/projectData",
  "./query-domains/scheduler",
  "./query-domains/skills",
  "./query-domains/systemRuntime",
  "./query-domains/workspace",
]) {
  if (!sdkQueries.includes(domainExport)) {
    errors.push(`packages/sdk/src/queries.ts must re-export ${domainExport}.`);
  }
}
for (const retiredLayoutExport of [
  'useLayoutQuery',
  'useLayoutsQuery',
  'fetchLayouts',
]) {
  if (sdkQueries.includes(retiredLayoutExport)) {
    errors.push(`packages/sdk/src/queries.ts must not re-export retired standalone layout helper ${retiredLayoutExport}.`);
  }
  if (sdkIndex.includes(retiredLayoutExport)) {
    errors.push(`packages/sdk/src/index.ts must not re-export retired standalone layout helper ${retiredLayoutExport}.`);
  }
}
for (const requiredPluginDomainExport of [
  "export * from './plugin-types';",
  "export * from './plugin-queries';",
  "export * from './plugin-mutations';",
]) {
  if (!sdkPluginsDomain.includes(requiredPluginDomainExport)) {
    errors.push(`packages/sdk/src/query-domains/plugins.ts must re-export ${requiredPluginDomainExport}.`);
  }
}
for (const retiredInlinePluginSnippet of [
  'async function requestPluginSettings(',
  'export async function reloadPlugins(',
  'export function usePluginInstallMutation()',
  'export interface PluginSettingsData',
]) {
  if (sdkPluginsDomain.includes(retiredInlinePluginSnippet)) {
    errors.push(
      `packages/sdk/src/query-domains/plugins.ts must not inline extracted plugin helper ${retiredInlinePluginSnippet}.`,
    );
  }
}
for (const requiredPluginTypeExport of [
  'export interface PluginSettingsData',
  'export interface PluginChangelogData',
  'export interface PluginProviderDetail',
  'export interface AgentHealthStatus',
]) {
  if (!sdkPluginTypes.includes(requiredPluginTypeExport)) {
    errors.push(`plugin-types.ts must include ${requiredPluginTypeExport}.`);
  }
}
for (const requiredPluginQueryExport of [
  'export async function requestAgentHealth',
  'export async function waitForAgentHealth',
  'export function usePluginsQuery',
  'export function useRegistryPluginsQuery',
]) {
  if (!sdkPluginQueries.includes(requiredPluginQueryExport)) {
    errors.push(`plugin-queries.ts must include ${requiredPluginQueryExport}.`);
  }
}
for (const retiredMutationSnippet of [
  'export function usePluginInstallMutation()',
  'export function useReloadPluginsMutation(',
]) {
  if (sdkPluginQueries.includes(retiredMutationSnippet)) {
    errors.push(`plugin-queries.ts must not inline mutation helper ${retiredMutationSnippet}.`);
  }
}
for (const requiredPluginMutationExport of [
  'export async function reloadPlugins',
  'export function usePluginInstallMutation()',
  'export function usePluginSettingsMutation(',
  'export function useAddProjectLayoutFromPluginMutation(',
]) {
  if (!sdkPluginMutations.includes(requiredPluginMutationExport)) {
    errors.push(`plugin-mutations.ts must include ${requiredPluginMutationExport}.`);
  }
}
for (const requiredPluginInvalidationHelper of [
  'function invalidatePluginQueries(',
  'function invalidatePluginGraphQueries(',
]) {
  if (!sdkPluginMutations.includes(requiredPluginInvalidationHelper)) {
    errors.push(
      `plugin-mutations.ts must keep shared invalidation helper ${requiredPluginInvalidationHelper}.`,
    );
  }
}
if (sdkApi.includes('export async function fetchLayouts(')) {
  errors.push('packages/sdk/src/api.ts must not expose the retired fetchLayouts helper.');
}
for (const requiredExport of [
  "export * from './api-core';",
  "export * from './api-agent-runtime';",
  "export * from './api-knowledge';",
]) {
  if (!sdkApi.includes(requiredExport)) {
    errors.push(`packages/sdk/src/api.ts must re-export ${requiredExport}.`);
  }
}
for (const retiredInlineApiSnippet of [
  'let _apiBase',
  'export interface SendMessageOptions',
  'export async function sendMessage(',
  'export async function streamMessage(',
  'export async function invokeAgent(',
  'export async function callTool(',
  'export async function invoke(',
  'function knowledgeBase(',
  'export async function fetchKnowledgeNamespaces(',
  'export async function fetchKnowledgeTree(',
  'export async function updateKnowledgeDoc(',
]) {
  if (sdkApi.includes(retiredInlineApiSnippet)) {
    errors.push(
      `packages/sdk/src/api.ts must not inline extracted API helper ${retiredInlineApiSnippet}.`,
    );
  }
}

const sdkApiCore = readFileSync(
  new URL('../packages/sdk/src/api-core.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function _setApiBase',
  'export function _setLayoutContext',
  'export function _resolveAgent',
  'export function _getPluginName',
  'export async function _getApiBase',
  'export function getPluginHeaders',
]) {
  if (!sdkApiCore.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/api-core.ts must include ${requiredHelper}.`);
  }
}

const sdkApiAgentRuntime = readFileSync(
  new URL('../packages/sdk/src/api-agent-runtime.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface SendMessageOptions',
  'export interface StreamMessageOptions',
  'export interface InvokeOptions',
  'export async function sendMessage',
  'export async function streamMessage',
  'export async function invokeAgent',
  'export async function callTool',
  'export async function invoke',
  'export async function fetchAgents',
  'export async function fetchConversations',
  'export async function fetchConversationMessages',
  'export async function fetchConfig',
]) {
  if (!sdkApiAgentRuntime.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/api-agent-runtime.ts must include ${requiredHelper}.`);
  }
}

const sdkApiKnowledge = readFileSync(
  new URL('../packages/sdk/src/api-knowledge.ts', import.meta.url),
  'utf8',
);
if (!sdkApiKnowledge.includes("./api-knowledge-utils")) {
  errors.push('packages/sdk/src/api-knowledge.ts must delegate shared request helpers to api-knowledge-utils.ts.');
}
for (const requiredHelper of [
  'export async function fetchKnowledgeNamespaces',
  'export async function fetchKnowledgeDocs',
  'export async function searchKnowledge',
  'export async function uploadKnowledge',
  'export async function deleteKnowledgeDoc',
  'export async function bulkDeleteKnowledgeDocs',
  'export async function fetchKnowledgeDocContent',
  'export async function fetchKnowledgeStatus',
  'export async function scanKnowledgeDirectory',
  'export async function fetchProjectConversations',
  'export async function addProjectLayoutFromPlugin',
  'export async function fetchAvailableLayouts',
  'export async function updateKnowledgeNamespace',
  'export async function fetchKnowledgeTree',
  'export async function fetchKnowledgeFiltered',
  'export async function updateKnowledgeDoc',
]) {
  if (!sdkApiKnowledge.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/api-knowledge.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineKnowledgeApiSnippet of [
  'function knowledgeBase(',
  'new URLSearchParams()',
  "headers: getPluginHeaders({ 'Content-Type': 'application/json' })",
]) {
  if (sdkApiKnowledge.includes(retiredInlineKnowledgeApiSnippet)) {
    errors.push(
      `packages/sdk/src/api-knowledge.ts must not inline extracted knowledge API helper ${retiredInlineKnowledgeApiSnippet}.`,
    );
  }
}

const sdkApiKnowledgeUtils = readFileSync(
  new URL('../packages/sdk/src/api-knowledge-utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function knowledgeBase',
  'export async function requestKnowledgeJson',
  'export function buildKnowledgeFilterQuery',
  'new URLSearchParams()',
  "headers: getPluginHeaders(",
]) {
  if (!sdkApiKnowledgeUtils.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/api-knowledge-utils.ts must include ${requiredHelper}.`);
  }
}

const sdkChatRuntime = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntime.ts', import.meta.url),
  'utf8',
);
for (const requiredExport of [
  "export * from './chatRuntimeTypes';",
  "export * from './chatRuntimeOrchestration';",
  "export * from './chatRuntimeConversations';",
  "export * from './chatRuntimeStream';",
  "export * from './chatRuntimeCoding';",
  "export * from './chatRuntimeDevice';",
]) {
  if (!sdkChatRuntime.includes(requiredExport)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntime.ts must re-export ${requiredExport}.`);
  }
}
for (const retiredInlineChatRuntimeSnippet of [
  'export interface CodingFileEntry',
  'export async function fetchCodingFiles(',
  'export async function fetchCodingDiff(',
  'export async function fetchCodingFileContent(',
  'export async function fetchTerminalPort(',
  'export async function executeCodingCommand(',
  'export async function fetchVapidPublicKey(',
  'export async function subscribePushNotifications(',
  'export async function unsubscribePushNotifications(',
  'export async function createVoiceSession(',
  'export interface ConversationSummary',
  'export interface ConversationLookup',
  'export interface ConversationMessagePart',
  'export interface ConversationMessage',
  'export interface ChatAttachmentInput',
  'export interface OrchestrationProviderSummary',
  'export type OrchestrationCommandInput =',
  'export async function fetchOrchestrationProviders(',
  'export async function dispatchOrchestrationCommand(',
  'export async function resolveOrchestrationRequest(',
  'export async function startOrchestrationSession(',
  'export async function sendOrchestrationTurn(',
  'export async function fetchAgentConversations(',
  'export async function renameConversation(',
  'export async function deleteConversation(',
  'export async function fetchConversationMessages(',
  'export async function fetchConversationById(',
  'export async function streamConversationTurn(',
  'export function useCodingFilesQuery(',
  'export function useCodingDiffQuery(',
  'export function useCodingFileContentQuery(',
  'export function useConversationsQuery(',
  'export function useOrchestrationProvidersQuery(',
  'export function useRenameConversationMutation(',
  'export function useDeleteConversationMutation(',
]) {
  if (sdkChatRuntime.includes(retiredInlineChatRuntimeSnippet)) {
    errors.push(
      `packages/sdk/src/query-domains/chatRuntime.ts must not inline extracted helper ${retiredInlineChatRuntimeSnippet}.`,
    );
  }
}

const sdkChatRuntimeTypes = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntimeTypes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export type OrchestrationProviderKind =',
  'export interface ConversationSummary',
  'export interface ConversationLookup',
  'export interface ConversationMessagePart',
  'export interface ConversationMessage',
  'export interface ChatAttachmentInput',
  'export interface OrchestrationProviderSummary',
  'export type OrchestrationCommandInput =',
]) {
  if (!sdkChatRuntimeTypes.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntimeTypes.ts must include ${requiredHelper}.`);
  }
}

const sdkChatRuntimeOrchestration = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntimeOrchestration.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function fetchOrchestrationProviders',
  'export async function dispatchOrchestrationCommand',
  'export async function resolveOrchestrationRequest',
  'export async function startOrchestrationSession',
  'export async function sendOrchestrationTurn',
  'export function useOrchestrationProvidersQuery',
]) {
  if (!sdkChatRuntimeOrchestration.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntimeOrchestration.ts must include ${requiredHelper}.`);
  }
}

const sdkChatRuntimeConversations = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntimeConversations.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function fetchAgentConversations',
  'export async function renameConversation',
  'export async function deleteConversation',
  'export async function fetchConversationMessages',
  'export async function fetchConversationById',
  'export function useConversationsQuery',
  'export function useRenameConversationMutation',
  'export function useDeleteConversationMutation',
  'mapConversationMessages',
]) {
  if (!sdkChatRuntimeConversations.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntimeConversations.ts must include ${requiredHelper}.`);
  }
}

const sdkChatRuntimeStream = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntimeStream.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function mapConversationMessages',
  'export function buildConversationTurnInput',
  'export function buildConversationTurnPayload',
  'export async function streamConversationTurn',
]) {
  if (!sdkChatRuntimeStream.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntimeStream.ts must include ${requiredHelper}.`);
  }
}

const sdkChatRuntimeCoding = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntimeCoding.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface CodingFileEntry',
  'export async function fetchCodingFiles',
  'export async function fetchCodingDiff',
  'export async function fetchCodingFileContent',
  'export async function fetchTerminalPort',
  'export async function executeCodingCommand',
  'export function useCodingFilesQuery',
  'export function useCodingDiffQuery',
  'export function useCodingFileContentQuery',
]) {
  if (!sdkChatRuntimeCoding.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntimeCoding.ts must include ${requiredHelper}.`);
  }
}

const sdkChatRuntimeDevice = readFileSync(
  new URL('../packages/sdk/src/query-domains/chatRuntimeDevice.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function fetchVapidPublicKey',
  'export async function subscribePushNotifications',
  'export async function unsubscribePushNotifications',
  'export async function createVoiceSession',
]) {
  if (!sdkChatRuntimeDevice.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/chatRuntimeDevice.ts must include ${requiredHelper}.`);
  }
}

const sdkWorkspace = readFileSync(
  new URL('../packages/sdk/src/query-domains/workspace.ts', import.meta.url),
  'utf8',
);
for (const requiredExport of [
  "export * from './workspaceConnections';",
  "export * from './workspaceProjects';",
  "export * from './workspaceWorkflows';",
]) {
  if (!sdkWorkspace.includes(requiredExport)) {
    errors.push(`packages/sdk/src/query-domains/workspace.ts must re-export ${requiredExport}.`);
  }
}
for (const retiredInlineWorkspaceSnippet of [
  'export interface GlobalKnowledgeStatus',
  'export interface ConnectionMutationInput',
  'export interface ConnectionTestResult',
  'export interface AvailableProjectLayout',
  'export interface WorkflowFile',
  'export function useConnectionsQuery(',
  'export function useSaveConnectionMutation(',
  'export function useProjectLayoutsQuery(',
  'export function useCreateProjectMutation(',
  'export function useAgentWorkflowsQuery(',
  'export function useCreateWorkflowMutation(',
]) {
  if (sdkWorkspace.includes(retiredInlineWorkspaceSnippet)) {
    errors.push(
      `packages/sdk/src/query-domains/workspace.ts must not inline extracted helper ${retiredInlineWorkspaceSnippet}.`,
    );
  }
}

const sdkWorkspaceConnections = readFileSync(
  new URL('../packages/sdk/src/query-domains/workspaceConnections.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface GlobalKnowledgeStatus',
  'export interface ConnectionMutationInput',
  'export interface ConnectionTestResult',
  'export function useConnectionsQuery',
  'export function useSaveConnectionMutation',
  'export function useGlobalKnowledgeStatusQuery',
  'export function useTestVectorDbConnectionMutation',
]) {
  if (!sdkWorkspaceConnections.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/workspaceConnections.ts must include ${requiredHelper}.`);
  }
}

const sdkWorkspaceProjects = readFileSync(
  new URL('../packages/sdk/src/query-domains/workspaceProjects.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface AvailableProjectLayout',
  'export function useProjectsQuery',
  'export function useProjectLayoutsQuery',
  'export function useAvailableProjectLayoutsQuery',
  'export function useCreateProjectMutation',
  'export function useDeleteProjectMutation',
  'export function useCreateLayoutMutation',
]) {
  if (!sdkWorkspaceProjects.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/workspaceProjects.ts must include ${requiredHelper}.`);
  }
}

const sdkWorkspaceWorkflows = readFileSync(
  new URL('../packages/sdk/src/query-domains/workspaceWorkflows.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface WorkflowFile',
  'export function useAgentWorkflowsQuery',
  'export function useWorkflowContentQuery',
  'export function useCreateWorkflowMutation',
  'export function useDeleteWorkflowMutation',
]) {
  if (!sdkWorkspaceWorkflows.includes(requiredHelper)) {
    errors.push(`packages/sdk/src/query-domains/workspaceWorkflows.ts must include ${requiredHelper}.`);
  }
}

const sdkHooksBarrel = readFileSync(
  new URL('../packages/sdk/src/hooks.ts', import.meta.url),
  'utf8',
);
for (const requiredExport of [
  "export * from './hooks/context';",
  "export * from './hooks/knowledge';",
  "export * from './hooks/operations';",
]) {
  if (!sdkHooksBarrel.includes(requiredExport)) {
    errors.push(`packages/sdk/src/hooks.ts must re-export ${requiredExport}.`);
  }
}
for (const retiredHookSnippet of [
  'export function useNotifications() {',
  'export function useSendToChat(',
  'export function useUserLookup(',
  'export function useServerFetch() {',
  "import { useCallback, useContext, useEffect, useState } from 'react';",
]) {
  if (sdkHooksBarrel.includes(retiredHookSnippet)) {
    errors.push(`packages/sdk/src/hooks.ts must stay a thin barrel and not inline ${retiredHookSnippet}.`);
  }
}

const sdkHookModules = new Map([
  [
    'packages/sdk/src/hooks/context.ts',
    [
      'export function useSDK()',
      'export function useAgents()',
      'export function useResolveAgent(',
      'export function useLaunchChat()',
      'export function useDockState()',
      'export function useWorkflows(',
    ],
  ],
  [
    'packages/sdk/src/hooks/knowledge.ts',
    [
      'export function useKnowledgeNamespaces(',
      'export function useKnowledgeDocs(',
      'export function useKnowledgeSearch(',
    ],
  ],
  [
    'packages/sdk/src/hooks/operations.ts',
    [
      'export function useNotifications()',
      'export function useSendToChat(',
      'export function useUserLookup(',
      'export function useServerFetch()',
    ],
  ],
]);
for (const [relativePath, requiredSnippets] of sdkHookModules) {
  const hookModule = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  for (const requiredSnippet of requiredSnippets) {
    if (!hookModule.includes(requiredSnippet)) {
      errors.push(`${relativePath} must include ${requiredSnippet}.`);
    }
  }
}

for (const legacySdkDeclaration of [
  'export interface OrchestrationProviderSummary',
  'export type OrchestrationCommandInput =',
  'export interface AgentTemplate',
  'export interface SystemStatus',
  'export interface AuthStatusData',
  'export interface MonitoringStatsData',
  'export interface BrandingData',
  'export interface CoreUpdateStatus',
  'export async function fetchUsageStats(',
  'export async function fetchInsights(',
  'export async function fetchFeedbackRatings(',
  'export interface ACPConnectionInfo',
  'export interface AcpSlashCommandDescriptor',
  'export interface FileSystemBrowseEntry',
  'export interface FileSystemBrowseResult',
  'export interface GlobalKnowledgeStatus',
  'export interface ConnectionMutationInput',
  'export interface ConnectionTestResult',
  'export interface AvailableProjectLayout',
  'export interface WorkflowFile',
  'export interface IntegrationViewModel',
  'export type RegistryCatalogTab =',
  'export interface PluginSettingField',
  'export interface PluginSettingsData',
  'export interface PluginChangelogEntry',
  'export interface PluginChangelogData',
  'export interface PluginProviderDetail',
  'export interface AgentHealthStatus',
  'export function useConversationsQuery(',
  'export async function createAgent(',
  'export async function updateAgent(',
  'export async function deleteAgent(',
  'export async function submitToolApproval(',
  'export function useUserQuery(',
  'export function useAgentsQuery(',
  'export function useCreateAgentMutation(',
  'export function useUpdateAgentMutation(',
  'export function useDeleteAgentMutation(',
  'export function useAgentQuery(',
  'export function useAgentTemplatesQuery(',
  'export function useModelsQuery(',
  'export function useAgentToolsQuery(',
  'export function useModelCapabilitiesQuery(',
  'export function useConfigQuery(',
  'export function useUpdateConfigMutation(',
  'export function useStatsQuery(',
  'export function useInvokeAgent(',
  'export function useAgentInvokeMutation(',
  'export function useLayoutQuery(',
  'export function useLayoutsQuery(',
  'export function useProjectsQuery(',
  'export function useProjectQuery(',
  'export function useConnectionsQuery(',
  'export function useModelConnectionsQuery(',
  'export function useRuntimeConnectionsQuery(',
  'export function useConnectionQuery(',
  'export function useSaveConnectionMutation(',
  'export function useDeleteConnectionMutation(',
  'export function useTestConnectionMutation(',
  'export function useGlobalKnowledgeStatusQuery(',
  'export function useTestVectorDbConnectionMutation(',
  'export function useProjectLayoutsQuery(',
  'export function useProjectLayoutQuery(',
  'export function useAvailableProjectLayoutsQuery(',
  'export function useDeleteProjectLayoutMutation(',
  'export function useAgentWorkflowsQuery(',
  'export function useWorkflowContentQuery(',
  'export function useCreateWorkflowMutation(',
  'export function useUpdateWorkflowMutation(',
  'export function useDeleteWorkflowMutation(',
  'export function useCreateProjectMutation(',
  'export function useCreateProjectLayoutMutation(',
  'export function useUpdateProjectMutation(',
  'export function useDeleteProjectMutation(',
  'export function useCreateLayoutMutation(',
  'export function useGitStatusQuery(',
  'export function useGitLogQuery(',
  'export function useKnowledgeNamespacesQuery(',
  'export function useKnowledgeDocsQuery(',
  'export function useKnowledgeSearchQuery(',
  'export function useKnowledgeSaveMutation(',
  'export function useKnowledgeDeleteMutation(',
  'export function useKnowledgeBulkDeleteMutation(',
  'export function useKnowledgeStatusQuery(',
  'export function useKnowledgeDocContentQuery(',
  'export function useKnowledgeScanMutation(',
  'export function useKnowledgeTreeQuery(',
  'export function useKnowledgeFilteredQuery(',
  'export function useKnowledgeUpdateMutation(',
  'export function useProjectConversationsQuery(',
  'export function useSystemStatusQuery(',
  'export function useMonitoringStatsQuery(',
  'export function useBrandingQuery(',
  'export function useTemplatesQuery(',
  'export function useFileSystemBrowseQuery(',
  'export function usePromptQuery(',
  'export function useACPConnectionsQuery(',
  'export function usePlaybooksQuery(',
  'export function usePromptsQuery(',
  'export function useRegistryItemsQuery(',
  'export function useInstalledRegistryItemsQuery(',
  'export function useCreatePlaybookMutation(',
  'export function useUpdatePlaybookMutation(',
  'export function useDeletePlaybookMutation(',
  'export function useImportPlaybooksMutation(',
  'export function useIntegrationsQuery(',
  'export function useIntegrationQuery(',
  'export function useSaveIntegrationMutation(',
  'export function useDeleteIntegrationMutation(',
  'export function useReconnectIntegrationMutation(',
  'export function useRegistryIntegrationsQuery(',
  'export function useRegistryIntegrationActionMutation(',
  'export function usePluginsQuery(',
  'export function usePluginSettingsQuery(',
  'export function usePluginInstallMutation(',
  'export function useReloadPluginsMutation(',
  'async function schedulerFetch<',
  'async function schedulerMutate(',
  'export function useSchedulerJobs(',
  'export function useSchedulerProviders(',
  'export function useSchedulerStats(',
  'export function useSchedulerStatus(',
  'export function useJobLogs(',
  'export function usePreviewSchedule(',
  'export function useRunJob(',
  'export function useToggleJob(',
  'export function useDeleteJob(',
  'export function useEditJob(',
  'export function useAddJob(',
  'export function useFetchRunOutput(',
  'export function useOpenArtifact(',
  'export function useUsageQuery(',
  'export function useInsightsQuery(',
  'export function useFeedbackRatingsQuery(',
  'export function useSkillsQuery(',
  'export function useRegistrySkillsQuery(',
  'export function useInstallSkillMutation(',
  'export function useUninstallSkillMutation(',
  'export function useUpdateSkillMutation(',
  'export function useSkillContentQuery(',
]) {
  if (sdkQueries.includes(legacySdkDeclaration)) {
    errors.push(
      `packages/sdk/src/queries.ts must not inline ${legacySdkDeclaration}.`,
    );
  }
}

const activeChatsContext = readFileSync(
  new URL('../src-ui/src/contexts/ActiveChatsContext.tsx', import.meta.url),
  'utf8',
);
if (activeChatsContext.includes('/conversations')) {
  errors.push('ActiveChatsContext must use shared conversation helpers instead of fetching conversations directly.');
}
if (!activeChatsContext.includes('../hooks/useActiveChatSessions')) {
  errors.push('ActiveChatsContext must delegate session fetch/prune logic to useActiveChatSessions.');
}

const orchestrationHook = readFileSync(
  new URL('../src-ui/src/hooks/useOrchestration.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './orchestration/ensureOrchestrationEventStream',
  'sendOrchestrationTurnRequest',
  'startOrchestrationSessionRequest',
  'useOrchestrationProvidersQuery',
]) {
  if (!orchestrationHook.includes(requiredHelper)) {
    errors.push(`useOrchestration must use ${requiredHelper}.`);
  }
}
for (const retiredInlineOrchestrationSnippet of [
  'type OrchestrationEvent =',
  'function upsertTextPart(',
  'function upsertToolPart(',
  'function finalizeAssistantTurn(',
  'async function resolveApproval(',
  'function handleEvent(',
  'const activeSources = new Map<string, EventSource>();',
]) {
  if (orchestrationHook.includes(retiredInlineOrchestrationSnippet)) {
    errors.push(`useOrchestration must not inline extracted orchestration helper ${retiredInlineOrchestrationSnippet}.`);
  }
}

const orchestrationDirChecks = [
  ['../src-ui/src/hooks/orchestration/types.ts', ['export type OrchestrationEvent =']],
  ['../src-ui/src/hooks/orchestration/messageParts.ts', ['export function upsertTextPart', 'export function upsertToolPart']],
  ['../src-ui/src/hooks/orchestration/assistantTurn.ts', ['export function finalizeAssistantTurn']],
  ['../src-ui/src/hooks/orchestration/snapshotHandlers.ts', ['export function applyOrchestrationSnapshot']],
  [
    '../src-ui/src/hooks/orchestration/sessionHandlers.ts',
    [
      'export function handleSessionLifecycleEvent',
      'export function handleSessionStateChangedEvent',
      'export function handleSessionExitedEvent',
    ],
  ],
  [
    '../src-ui/src/hooks/orchestration/streamHandlers.ts',
    [
      'export function handleTextDeltaEvent',
      'export function handleReasoningDeltaEvent',
      'export function handleToolStartedEvent',
      'export function handleToolProgressEvent',
      'export function handleToolCompletedEvent',
    ],
  ],
  [
    '../src-ui/src/hooks/orchestration/approvalHandlers.ts',
    [
      'export function handleRequestOpenedEvent',
      'export function handleRequestResolvedEvent',
      'async function resolveApproval',
    ],
  ],
  [
    '../src-ui/src/hooks/orchestration/turnHandlers.ts',
    [
      'export function handleTurnStartedEvent',
      'export function handleTurnCompletedEvent',
      'export function handleTurnAbortedEvent',
      'export function handleRuntimeErrorEvent',
      'export function handleRuntimeWarningEvent',
    ],
  ],
  ['../src-ui/src/hooks/orchestration/eventHandlers.ts', ['export function handleOrchestrationEvent']],
  ['../src-ui/src/hooks/orchestration/ensureOrchestrationEventStream.ts', ['const activeSources = new Map<string, EventSource>();', 'export function ensureOrchestrationEventStream']],
];
for (const [relativePath, requiredHelpers] of orchestrationDirChecks) {
  const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  for (const requiredHelper of requiredHelpers) {
    if (!contents.includes(requiredHelper)) {
      errors.push(`${relativePath.replace('../', '')} must include ${requiredHelper}.`);
    }
  }
}

const chatDock = readFileSync(
  new URL('../src-ui/src/components/ChatDock.tsx', import.meta.url),
  'utf8',
);
if (chatDock.includes('/api/conversations/')) {
  errors.push('ChatDock must use a shared conversation lookup helper.');
}
for (const requiredHelper of [
  './chat-dock/ChatDockContentArea',
  './chat-dock/ChatDockModalStack',
  './chat-dock/ChatDockProjectContext',
  './chat-dock/useChatDockActiveChatSync',
  './chat-dock/useChatDockViewModel',
]) {
  if (!chatDock.includes(requiredHelper)) {
    errors.push(`ChatDock must delegate extracted UI/state helpers to ${requiredHelper}.`);
  }
}
for (const retiredInlineChatDockSnippet of [
  'const triedChatRef = useRef<string | null>(null);',
  'fetchConversationById(activeChat, apiBase)',
  'function CwdBreadcrumb(',
  '<ConversationHistory',
  '<ChatSettingsPanel',
  '<SessionPickerModal',
  '<NewChatModal',
]) {
  if (chatDock.includes(retiredInlineChatDockSnippet)) {
    errors.push(`ChatDock must not inline extracted helper logic ${retiredInlineChatDockSnippet}.`);
  }
}

const chatDockContentArea = readFileSync(
  new URL('../src-ui/src/components/chat-dock/ChatDockContentArea.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ChatDockContentArea',
  'ConversationHistory',
  'ChatDockBody',
]) {
  if (!chatDockContentArea.includes(requiredHelper)) {
    errors.push(`ChatDockContentArea.tsx must include ${requiredHelper}.`);
  }
}

const chatDockModalStack = readFileSync(
  new URL('../src-ui/src/components/chat-dock/ChatDockModalStack.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ChatDockModalStack',
  'ChatSettingsPanel',
  'NewChatModal',
  'SessionPickerModal',
]) {
  if (!chatDockModalStack.includes(requiredHelper)) {
    errors.push(`ChatDockModalStack.tsx must include ${requiredHelper}.`);
  }
}

const chatDockActiveChatSync = readFileSync(
  new URL('../src-ui/src/components/chat-dock/useChatDockActiveChatSync.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useChatDockActiveChatSync',
  'fetchConversationById',
  'useEffect',
]) {
  if (!chatDockActiveChatSync.includes(requiredHelper)) {
    errors.push(`useChatDockActiveChatSync.ts must include ${requiredHelper}.`);
  }
}

const chatDockUtils = readFileSync(
  new URL('../src-ui/src/components/chat-dock/chat-dock-utils.ts', import.meta.url),
  'utf8',
);
if (!chatDockUtils.includes('export function splitWorkingDirectoryPath')) {
  errors.push('chat-dock-utils.ts must export splitWorkingDirectoryPath.');
}

const codingLayout = readFileSync(
  new URL('../src-ui/src/components/CodingLayout.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './coding-layout/CodingTerminalPanel',
  './coding-layout/DiffPanel',
  './coding-layout/FileContentViewer',
  './coding-layout/FileTreePanel',
  './coding-layout/NewTerminalModal',
  './coding-layout/types',
]) {
  if (!codingLayout.includes(requiredImport)) {
    errors.push(`CodingLayout must delegate extracted UI sections to ${requiredImport}.`);
  }
}

const cliInstall = readFileSync(
  new URL('../packages/cli/src/commands/install.ts', import.meta.url),
  'utf8',
);
if (!cliInstall.includes("./install-layout.js")) {
  errors.push('packages/cli/src/commands/install.ts must delegate layout application to install-layout.ts.');
}
for (const retiredInlineInstallSnippet of [
  'const projectsDir = join(PROJECT_HOME, \'projects\');',
  'console.log(`  ✓ Layout applied to project: ${targetProject}`);',
]) {
  if (cliInstall.includes(retiredInlineInstallSnippet)) {
    errors.push(`packages/cli/src/commands/install.ts must not inline extracted layout install logic ${retiredInlineInstallSnippet}.`);
  }
}

const cliInstallLayout = readFileSync(
  new URL('../packages/cli/src/commands/install-layout.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function applyInstalledPluginLayout',
  "const projectsDir = join(projectHome, 'projects');",
  'console.log(`  ✓ Layout applied to project: ${targetProject}`);',
]) {
  if (!cliInstallLayout.includes(requiredHelper)) {
    errors.push(`packages/cli/src/commands/install-layout.ts must include ${requiredHelper}.`);
  }
}
for (const retiredInlineCodingSnippet of [
  'function FileTreeNode(',
  'function FileTreePanel(',
  'function DiffPanel(',
  'function FileContentViewer(',
  'function NewTerminalModal(',
  '<div className="coding-layout__terminal-bar">',
]) {
  if (codingLayout.includes(retiredInlineCodingSnippet)) {
    errors.push(`CodingLayout must not inline extracted coding-layout UI ${retiredInlineCodingSnippet}.`);
  }
}

const codingLayoutFileTree = readFileSync(
  new URL('../src-ui/src/components/coding-layout/FileTreePanel.tsx', import.meta.url),
  'utf8',
);
if (!codingLayoutFileTree.includes('useCodingFilesQuery')) {
  errors.push('FileTreePanel must use useCodingFilesQuery.');
}

const codingLayoutDiff = readFileSync(
  new URL('../src-ui/src/components/coding-layout/DiffPanel.tsx', import.meta.url),
  'utf8',
);
if (!codingLayoutDiff.includes('useCodingDiffQuery')) {
  errors.push('DiffPanel must use useCodingDiffQuery.');
}

const codingLayoutFileContent = readFileSync(
  new URL('../src-ui/src/components/coding-layout/FileContentViewer.tsx', import.meta.url),
  'utf8',
);
if (!codingLayoutFileContent.includes('useCodingFileContentQuery')) {
  errors.push('FileContentViewer must use useCodingFileContentQuery.');
}

const codingLayoutTerminal = readFileSync(
  new URL('../src-ui/src/components/coding-layout/CodingTerminalPanel.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of ['../ACPChatPanel', '../TerminalPanel']) {
  if (!codingLayoutTerminal.includes(requiredImport)) {
    errors.push(`CodingTerminalPanel must render extracted terminal content via ${requiredImport}.`);
  }
}

const codingLayoutUtils = readFileSync(
  new URL('../src-ui/src/components/coding-layout/utils.ts', import.meta.url),
  'utf8',
);
if (!codingLayoutUtils.includes('export function buildNewTerminalItems')) {
  errors.push('coding-layout/utils.ts must export buildNewTerminalItems.');
}

const codingLayoutModal = readFileSync(
  new URL('../src-ui/src/components/coding-layout/NewTerminalModal.tsx', import.meta.url),
  'utf8',
);
if (!codingLayoutModal.includes('buildNewTerminalItems')) {
  errors.push('NewTerminalModal must use buildNewTerminalItems.');
}

const terminalPanel = readFileSync(
  new URL('../src-ui/src/components/TerminalPanel.tsx', import.meta.url),
  'utf8',
);
if (terminalPanel.includes('/api/system/terminal-port')) {
  errors.push('TerminalPanel must use the shared terminal port helper.');
}
if (terminalPanel.includes('/api/coding/exec')) {
  errors.push('TerminalPanel must use the shared coding exec helper.');
}
for (const requiredHelper of ['fetchTerminalPort', 'executeCodingCommand']) {
  if (!terminalPanel.includes(requiredHelper)) {
    errors.push(`TerminalPanel must use ${requiredHelper}.`);
  }
}

const pushNotifications = readFileSync(
  new URL('../src-ui/src/hooks/usePushNotifications.ts', import.meta.url),
  'utf8',
);
if (pushNotifications.includes('fetch(`${apiBase}/api/system/vapid-public-key`)')) {
  errors.push('usePushNotifications must use the shared VAPID key helper.');
}
if (pushNotifications.includes('fetch(`${apiBase}/api/system/push-subscribe`')) {
  errors.push('usePushNotifications must use the shared push subscribe helper.');
}
if (pushNotifications.includes('fetch(`${apiBase}/api/system/push-unsubscribe`')) {
  errors.push('usePushNotifications must use the shared push unsubscribe helper.');
}
for (const requiredHelper of [
  'fetchVapidPublicKey',
  'subscribePushNotifications',
  'unsubscribePushNotifications',
]) {
  if (!pushNotifications.includes(requiredHelper)) {
    errors.push(`usePushNotifications must use ${requiredHelper}.`);
  }
}

const voiceSession = readFileSync(
  new URL('../src-ui/src/hooks/useVoiceSession.ts', import.meta.url),
  'utf8',
);
if (voiceSession.includes('/api/voice/sessions')) {
  errors.push('useVoiceSession must use the shared voice session helper.');
}
if (!voiceSession.includes('createVoiceSession')) {
  errors.push('useVoiceSession must use createVoiceSession.');
}
if (!voiceSession.includes('./voiceSessionAudio')) {
  errors.push('useVoiceSession must delegate audio codec helpers to voiceSessionAudio.ts.');
}
for (const retiredVoiceSnippet of [
  'function float32ToInt16(',
  'function downsample(',
  'function int16ToFloat32(',
  'function base64ToInt16(',
  'function int16ToBase64(',
]) {
  if (voiceSession.includes(retiredVoiceSnippet)) {
    errors.push(`useVoiceSession must not inline extracted audio helper ${retiredVoiceSnippet}.`);
  }
}

const voiceSessionAudio = readFileSync(
  new URL('../src-ui/src/hooks/voiceSessionAudio.ts', import.meta.url),
  'utf8',
);
for (const requiredVoiceHelper of [
  'export function float32ToInt16',
  'export function downsample',
  'export function int16ToFloat32',
  'export function base64ToInt16',
  'export function int16ToBase64',
]) {
  if (!voiceSessionAudio.includes(requiredVoiceHelper)) {
    errors.push(`voiceSessionAudio.ts must include ${requiredVoiceHelper}.`);
  }
}

const novaSonic = readFileSync(
  new URL('../src-server/voice/providers/nova-sonic.ts', import.meta.url),
  'utf8',
);
if (!novaSonic.includes('./nova-sonic-events.js')) {
  errors.push('nova-sonic.ts must delegate stream event parsing to nova-sonic-events.ts.');
}
for (const retiredNovaSnippet of [
  "console.warn('[NovaSonic] Failed to parse response chunk:'",
  "this.emit('transcript'",
  "this.emit('audio', Buffer.from(event.audioOutput.content, 'base64'))",
  "this.emit('toolUse'",
]) {
  if (novaSonic.includes(retiredNovaSnippet)) {
    errors.push(`nova-sonic.ts must not inline extracted stream event helper ${retiredNovaSnippet}.`);
  }
}

const novaSonicEvents = readFileSync(
  new URL('../src-server/voice/providers/nova-sonic-events.ts', import.meta.url),
  'utf8',
);
for (const requiredNovaHelper of [
  'export function parseNovaSonicRawEvent',
  'export function processNovaSonicStreamEvent',
  "console.warn",
  "effects.emit('transcript'",
  "effects.emit('toolUse'",
]) {
  if (!novaSonicEvents.includes(requiredNovaHelper)) {
    errors.push(`nova-sonic-events.ts must include ${requiredNovaHelper}.`);
  }
}

const newChatModal = readFileSync(
  new URL('../src-ui/src/components/NewChatModal.tsx', import.meta.url),
  'utf8',
);
if (newChatModal.includes('/api/connections/runtimes')) {
  errors.push('NewChatModal must use shared SDK runtime connection queries.');
}
if (newChatModal.includes('/api/projects/')) {
  errors.push('NewChatModal must use shared SDK project queries.');
}

const agentEditorForm = readFileSync(
  new URL('../src-ui/src/views/AgentEditorForm.tsx', import.meta.url),
  'utf8',
);
if (agentEditorForm.includes('/api/connections/runtimes')) {
  errors.push('AgentEditorForm must use shared SDK runtime connection queries.');
}
if (agentEditorForm.includes('/api/connections/models')) {
  errors.push('AgentEditorForm must use shared SDK model connection queries.');
}
for (const requiredImport of [
  './agent-editor/AgentEditorBasicTab',
  './agent-editor/AgentEditorRuntimeTab',
  './agent-editor/AgentEditorToolsTab',
  './agent-editor/AgentEditorSkillsTab',
  './agent-editor/AgentEditorAdvancedSection',
  './agent-editor/utils',
]) {
  if (!agentEditorForm.includes(requiredImport)) {
    errors.push(`AgentEditorForm must delegate extracted sections to ${requiredImport}.`);
  }
}
for (const retiredInlineAgentEditorSnippet of [
  'function slugify(name: string)',
  'const { data: runtimeConnections = [] } =',
  'const enabledServers = new Set(form.tools.mcpServers);',
  'No skills enabled.',
  'Remove Guardrails',
]) {
  if (agentEditorForm.includes(retiredInlineAgentEditorSnippet)) {
    errors.push(
      `AgentEditorForm must not inline extracted editor logic ${retiredInlineAgentEditorSnippet}.`,
    );
  }
}

const agentEditorUtils = readFileSync(
  new URL('../src-ui/src/views/agent-editor/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function slugify',
  'export function getAgentType',
  'export function getEditorTabs',
  'export function removeIntegration',
  'export function toggleIntegrationToolEnabled',
  'export function toggleIntegrationToolAutoApprove',
]) {
  if (!agentEditorUtils.includes(requiredHelper)) {
    errors.push(`agent-editor/utils.ts must include ${requiredHelper}.`);
  }
}

const headerView = readFileSync(
  new URL('../src-ui/src/components/Header.tsx', import.meta.url),
  'utf8',
);
if (headerView.includes('/api/connections/runtimes')) {
  errors.push('Header must use shared SDK runtime connection queries.');
}
for (const requiredImport of [
  './header/HeaderActions',
  './header/useHeaderViewModel',
]) {
  if (!headerView.includes(requiredImport)) {
    errors.push(`Header.tsx must delegate extracted header logic to ${requiredImport}.`);
  }
}
for (const retiredInlineHeaderSnippet of [
  'function getHelpPrompts(',
  "(currentView as any).projectSlug",
  "{showHelp && (",
  "{showOverflow && (",
  'const createChatSession = useCreateChatSession()',
  'const { activeConnection } = useConnections()',
  'checkServerHealth',
]) {
  if (headerView.includes(retiredInlineHeaderSnippet)) {
    errors.push(
      `Header.tsx must not inline extracted header logic ${retiredInlineHeaderSnippet}.`,
    );
  }
}
const headerUtils = readFileSync(
  new URL('../src-ui/src/components/header/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getHelpPrompts',
  'export function getHeaderBreadcrumb',
]) {
  if (!headerUtils.includes(requiredHelper)) {
    errors.push(`header/utils.ts must include ${requiredHelper}.`);
  }
}

const headerActions = readFileSync(
  new URL('../src-ui/src/components/header/HeaderActions.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function HeaderActions',
  '@stallion-ai/connect',
  '../NotificationHistory',
  './HelpMenu',
  './OverflowMenu',
]) {
  if (!headerActions.includes(requiredHelper)) {
    errors.push(`HeaderActions.tsx must include ${requiredHelper}.`);
  }
}

const headerViewModel = readFileSync(
  new URL('../src-ui/src/components/header/useHeaderViewModel.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useHeaderViewModel',
  'useRuntimeConnectionsQuery',
  'useCreateChatSession',
  'useSendMessage',
  'useNavigation',
  'getHelpPrompts',
  'getHeaderBreadcrumb',
]) {
  if (!headerViewModel.includes(requiredHelper)) {
    errors.push(`useHeaderViewModel.ts must include ${requiredHelper}.`);
  }
}

const runtimeConnectionView = readFileSync(
  new URL('../src-ui/src/views/RuntimeConnectionView.tsx', import.meta.url),
  'utf8',
);
if (runtimeConnectionView.includes('fetch(')) {
  errors.push('RuntimeConnectionView must not issue raw fetch() calls.');
}
if (!runtimeConnectionView.includes('useConnectionQuery')) {
  errors.push('RuntimeConnectionView must use shared SDK connection hooks.');
}

const providerSettingsView = readFileSync(
  new URL('../src-ui/src/views/ProviderSettingsView.tsx', import.meta.url),
  'utf8',
);
if (providerSettingsView.includes('fetch(')) {
  errors.push('ProviderSettingsView must not issue raw fetch() calls.');
}
if (!providerSettingsView.includes('useModelConnectionsQuery')) {
  errors.push('ProviderSettingsView must use shared SDK model connection hooks.');
}
for (const requiredImport of [
  './provider-settings/ProviderConnectionForm',
  './provider-settings/ProviderStackOverview',
  './provider-settings/ProviderTypePicker',
  './provider-settings/types',
  './provider-settings/utils',
]) {
  if (!providerSettingsView.includes(requiredImport)) {
    errors.push(`ProviderSettingsView must delegate extracted provider sections to ${requiredImport}.`);
  }
}
for (const retiredInlineProviderSnippet of [
  'const PROVIDER_TYPES:',
  'function capabilitiesForType(',
  'function defaultConfig(',
  'const typePicker = (',
  'const stackOverview = (',
  "{form.type === 'openai-compat' && (",
]) {
  if (providerSettingsView.includes(retiredInlineProviderSnippet)) {
    errors.push(`ProviderSettingsView must not inline extracted provider-settings logic ${retiredInlineProviderSnippet}.`);
  }
}

const providerSettingsUtils = readFileSync(
  new URL('../src-ui/src/views/provider-settings/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function capabilitiesForType',
  'export function defaultConfig',
  'export function filterModelProviders',
  'export function describeProvider',
]) {
  if (!providerSettingsUtils.includes(requiredHelper)) {
    errors.push(`provider-settings/utils.ts must include ${requiredHelper}.`);
  }
}

const appShellView = readFileSync(new URL('../src-ui/src/App.tsx', import.meta.url), 'utf8');
for (const requiredImport of [
  './app-shell/AppViewContent',
  './app-shell/routing',
]) {
  if (!appShellView.includes(requiredImport)) {
    errors.push(`App.tsx must delegate extracted app-shell logic to ${requiredImport}.`);
  }
}
for (const retiredInlineAppSnippet of [
  'const layoutTypeRegistry:',
  'const renderViewContent = () => {',
  "if (path === '/agents' || path.startsWith('/agents/')) {",
  "if (path === '/connections/providers') {",
  "if (path === '/projects/new') {",
  'function ProjectLayoutRenderer(',
]) {
  if (appShellView.includes(retiredInlineAppSnippet)) {
    errors.push(`App.tsx must not inline extracted app-shell logic ${retiredInlineAppSnippet}.`);
  }
}

const appRouting = readFileSync(
  new URL('../src-ui/src/app-shell/routing.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function resolveViewFromPath',
  'export function getPathForView',
]) {
  if (!appRouting.includes(requiredHelper)) {
    errors.push(`app-shell/routing.ts must include ${requiredHelper}.`);
  }
}

const appViewContent = readFileSync(
  new URL('../src-ui/src/app-shell/AppViewContent.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  '../views/AgentsView',
  '../views/ProviderSettingsView',
  './ProjectLayoutRenderer',
]) {
  if (!appViewContent.includes(requiredImport)) {
    errors.push(`AppViewContent must render extracted app views via ${requiredImport}.`);
  }
}

const projectLayoutRenderer = readFileSync(
  new URL('../src-ui/src/app-shell/ProjectLayoutRenderer.tsx', import.meta.url),
  'utf8',
);
if (!projectLayoutRenderer.includes('./layoutRegistry')) {
  errors.push('ProjectLayoutRenderer must use the extracted layout registry.');
}

const knowledgeConnectionView = readFileSync(
  new URL('../src-ui/src/views/KnowledgeConnectionView.tsx', import.meta.url),
  'utf8',
);
if (knowledgeConnectionView.includes('fetch(')) {
  errors.push('KnowledgeConnectionView must not issue raw fetch() calls.');
}
if (!knowledgeConnectionView.includes('useGlobalKnowledgeStatusQuery')) {
  errors.push('KnowledgeConnectionView must use shared SDK knowledge and connection hooks.');
}

const connectionsHubView = readFileSync(
  new URL('../src-ui/src/views/ConnectionsHub.tsx', import.meta.url),
  'utf8',
);
if (connectionsHubView.includes('fetch(')) {
  errors.push('ConnectionsHub must not issue raw fetch() calls.');
}
if (!connectionsHubView.includes('useConnectionsQuery')) {
  errors.push('ConnectionsHub must use shared SDK connection and integration hooks.');
}
for (const requiredImport of [
  './connections-hub/ConnectionsHubSection',
  './connections-hub/utils',
]) {
  if (!connectionsHubView.includes(requiredImport)) {
    errors.push(`ConnectionsHub must delegate extracted UI/state helpers to ${requiredImport}.`);
  }
}
for (const retiredInlineConnectionsHubSnippet of [
  'function IconCloud(',
  'function IconServer(',
  'function IconLink(',
  'function IconDatabase(',
  'function IconTool(',
  'function statusClass(',
  'function describeConnection(',
  'connections-hub__section-header',
]) {
  if (connectionsHubView.includes(retiredInlineConnectionsHubSnippet)) {
    errors.push(`ConnectionsHub must not inline extracted helper logic ${retiredInlineConnectionsHubSnippet}.`);
  }
}

const connectionsHubUtils = readFileSync(
  new URL('../src-ui/src/views/connections-hub/utils.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getProviderIcon',
  'export function getConnectionStatusClass',
  'export function describeConnection',
  'export function getConnectionTypeText',
  'export function IconDatabase',
  'export function IconTool',
]) {
  if (!connectionsHubUtils.includes(requiredHelper)) {
    errors.push(`connections-hub/utils.tsx must include ${requiredHelper}.`);
  }
}

const connectionsHubSection = readFileSync(
  new URL('../src-ui/src/views/connections-hub/ConnectionsHubSection.tsx', import.meta.url),
  'utf8',
);
if (!connectionsHubSection.includes('export function ConnectionsHubSection')) {
  errors.push('ConnectionsHubSection.tsx must export ConnectionsHubSection.');
}

const systemStatusHook = readFileSync(
  new URL('../src-ui/src/hooks/useSystemStatus.ts', import.meta.url),
  'utf8',
);
if (systemStatusHook.includes('fetch(`${apiBase}/api/system/status`)')) {
  errors.push('useSystemStatus must read system status through shared SDK queries.');
}
if (!systemStatusHook.includes('useSystemStatusQuery')) {
  errors.push('useSystemStatus must delegate to the shared SDK system status query.');
}
if (!systemStatusHook.includes('verifyBedrockConnection')) {
  errors.push('useSystemStatus must use the shared Bedrock verification helper.');
}

const serverCapabilitiesHook = readFileSync(
  new URL('../src-ui/src/hooks/useServerCapabilities.ts', import.meta.url),
  'utf8',
);
if (serverCapabilitiesHook.includes('fetch(`${apiBase}/api/system/capabilities`)')) {
  errors.push('useServerCapabilities must read capabilities through shared SDK queries.');
}
if (!serverCapabilitiesHook.includes('useServerCapabilitiesQuery')) {
  errors.push('useServerCapabilities must use the shared SDK capabilities query.');
}

const gitStatusHook = readFileSync(
  new URL('../src-ui/src/hooks/useGitStatus.ts', import.meta.url),
  'utf8',
);
if (gitStatusHook.includes('fetch(')) {
  errors.push('useGitStatus must not issue raw fetch() calls.');
}
for (const requiredHook of ['useGitStatusQuery', 'useGitLogQuery']) {
  if (!gitStatusHook.includes(requiredHook)) {
    errors.push(`useGitStatus must use ${requiredHook}.`);
  }
}

const aiEnrichHook = readFileSync(
  new URL('../src-ui/src/hooks/useAIEnrich.ts', import.meta.url),
  'utf8',
);
if (aiEnrichHook.includes('fetch(')) {
  errors.push('useAIEnrich must not issue raw fetch() calls.');
}
if (!aiEnrichHook.includes('invoke(')) {
  errors.push('useAIEnrich must use the shared SDK invoke helper.');
}

const brandingHook = readFileSync(
  new URL('../src-ui/src/hooks/useBranding.ts', import.meta.url),
  'utf8',
);
if (brandingHook.includes('fetch(')) {
  errors.push('useBranding must not issue raw fetch() calls.');
}
if (!brandingHook.includes('useBrandingQuery')) {
  errors.push('useBranding must use the shared branding query.');
}

const recentAgentsHook = readFileSync(
  new URL('../src-ui/src/hooks/useRecentAgents.ts', import.meta.url),
  'utf8',
);
if (recentAgentsHook.includes('fetch(')) {
  errors.push('useRecentAgents must not issue raw fetch() calls.');
}
if (!recentAgentsHook.includes('telemetry.track')) {
  errors.push('useRecentAgents must use shared telemetry tracking.');
}

const toolApprovalHook = readFileSync(
  new URL('../src-ui/src/hooks/useToolApproval.ts', import.meta.url),
  'utf8',
);
if (toolApprovalHook.includes('fetch(')) {
  errors.push('useToolApproval must not issue raw fetch() calls.');
}
if (!toolApprovalHook.includes('submitToolApproval')) {
  errors.push('useToolApproval must use the shared tool approval helper.');
}

const sessionPickerModal = readFileSync(
  new URL('../src-ui/src/components/SessionPickerModal.tsx', import.meta.url),
  'utf8',
);
if (sessionPickerModal.includes('fetch(')) {
  errors.push('SessionPickerModal must not issue raw fetch() calls.');
}
if (!sessionPickerModal.includes('fetchAgentConversations')) {
  errors.push('SessionPickerModal must use the shared conversation fetch helper.');
}

const onboardingGate = readFileSync(
  new URL('../src-ui/src/components/OnboardingGate.tsx', import.meta.url),
  'utf8',
);
if (onboardingGate.includes('/api/system/status')) {
  errors.push('OnboardingGate must not issue direct system status checks.');
}
if (!onboardingGate.includes("../lib/serverHealth")) {
  errors.push('OnboardingGate must use the shared server health helper.');
}

const offlineBanner = readFileSync(
  new URL('../src-ui/src/components/OfflineBanner.tsx', import.meta.url),
  'utf8',
);
if (offlineBanner.includes('/api/system/status')) {
  errors.push('OfflineBanner must not issue direct system status checks.');
}
if (!offlineBanner.includes("../lib/serverHealth")) {
  errors.push('OfflineBanner must use the shared server health helper.');
}

const projectSettingsView = readFileSync(
  new URL('../src-ui/src/views/ProjectSettingsView.tsx', import.meta.url),
  'utf8',
);
if (projectSettingsView.includes('fetch(')) {
  errors.push('ProjectSettingsView must not issue raw fetch() calls.');
}
if (!projectSettingsView.includes('useProjectQuery')) {
  errors.push('ProjectSettingsView must use shared SDK project hooks.');
}
for (const requiredImport of [
  './project-settings/AgentsSection',
  './project-settings/LayoutsSection',
  './project-settings/KnowledgeSection',
  './project-settings/types',
  './project-settings/utils',
]) {
  if (!projectSettingsView.includes(requiredImport)) {
    errors.push(`ProjectSettingsView must delegate extracted UI to ${requiredImport}.`);
  }
}
for (const retiredInlineProjectSettingsSnippet of [
  'function AgentsSection({',
  'function LayoutsSection({',
  'function KnowledgeSection({',
  'interface DocMeta {',
  'interface KnowledgeStatus {',
  'const timeAgo = (iso: string) => {',
  'const f: ProjectForm = {',
]) {
  if (projectSettingsView.includes(retiredInlineProjectSettingsSnippet)) {
    errors.push(
      `ProjectSettingsView must not inline extracted project-settings logic ${retiredInlineProjectSettingsSnippet}.`,
    );
  }
}

const projectSettingsUtils = readFileSync(
  new URL('../src-ui/src/views/project-settings/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function buildProjectForm',
  'export function getKnowledgeTimeAgo',
]) {
  if (!projectSettingsUtils.includes(requiredHelper)) {
    errors.push(`project-settings/utils.ts must include ${requiredHelper}.`);
  }
}

const newProjectModal = readFileSync(
  new URL('../src-ui/src/components/NewProjectModal.tsx', import.meta.url),
  'utf8',
);
if (newProjectModal.includes('fetch(')) {
  errors.push('NewProjectModal must not issue raw fetch() calls.');
}
for (const requiredHook of [
  'useTemplatesQuery',
  'useFileSystemBrowseQuery',
  'useCreateProjectMutation',
  'useCreateProjectLayoutMutation',
]) {
  if (!newProjectModal.includes(requiredHook)) {
    errors.push(`NewProjectModal must use shared SDK hook ${requiredHook}.`);
  }
}

const settingsView = readFileSync(
  new URL('../src-ui/src/views/SettingsView.tsx', import.meta.url),
  'utf8',
);
if (settingsView.includes('fetch(')) {
  errors.push('SettingsView must not issue raw fetch() calls.');
}
for (const requiredImport of [
  './settings/EnvironmentStatus',
  './settings/VoiceFeaturesSection',
  './settings/AccentColorPicker',
  './settings/AIModelsSection',
  './settings/ConnectionSection',
  './settings/SystemSection',
  './settings/utils',
]) {
  if (!settingsView.includes(requiredImport)) {
    errors.push(`SettingsView must delegate section UI to ${requiredImport}.`);
  }
}
if (!settingsView.includes("../lib/serverHealth")) {
  errors.push('SettingsView must use the shared server health helper for connection checks.');
}
for (const retiredInlineSettingsSnippet of [
  "const SECTION_TERMS: Record<string, string> = {",
  "const validationErrors: Record<string, string> = {};",
  '<Section icon="◆" title="AI & Models" id="section-ai">',
  '<Section icon="◇" title="Connection" id="section-connection">',
  '<Section icon="⚙" title="System" id="section-system">',
  "const LOCAL_KEYS = [",
]) {
  if (settingsView.includes(retiredInlineSettingsSnippet)) {
    errors.push(`SettingsView must not inline extracted settings logic ${retiredInlineSettingsSnippet}.`);
  }
}

const environmentStatusView = readFileSync(
  new URL('../src-ui/src/views/settings/EnvironmentStatus.tsx', import.meta.url),
  'utf8',
);
if (!environmentStatusView.includes('useSystemStatusForApiBaseQuery')) {
  errors.push('EnvironmentStatus must use useSystemStatusForApiBaseQuery.');
}

const coreUpdateCheckView = readFileSync(
  new URL('../src-ui/src/views/settings/CoreUpdateCheck.tsx', import.meta.url),
  'utf8',
);
for (const requiredHook of [
  'useCoreUpdateStatusQuery',
  'useApplyCoreUpdateMutation',
]) {
  if (!coreUpdateCheckView.includes(requiredHook)) {
    errors.push(`CoreUpdateCheck must use shared system hook ${requiredHook}.`);
  }
}

const settingsUtils = readFileSync(
  new URL('../src-ui/src/views/settings/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getSettingsValidation',
  'export function isSettingsSectionVisible',
  "const SECTION_TERMS: Record<string, string> = {",
]) {
  if (!settingsUtils.includes(requiredHelper)) {
    errors.push(`settings/utils.ts must include ${requiredHelper}.`);
  }
}

const pluginManagementView = readFileSync(
  new URL('../src-ui/src/views/PluginManagementView.tsx', import.meta.url),
  'utf8',
);
if (pluginManagementView.includes('fetch(')) {
  errors.push('PluginManagementView must not issue raw fetch() calls.');
}
for (const requiredImport of [
  './plugin-management/PluginDetailPanel',
  './plugin-management/PluginEmptyState',
  './plugin-management/PluginModalStack',
  './plugin-management/usePluginManagementViewModel',
]) {
  if (!pluginManagementView.includes(requiredImport)) {
    errors.push(`PluginManagementView must delegate extracted UI to ${requiredImport}.`);
  }
}
for (const retiredInlinePluginSnippet of [
  '<DetailHeader',
  'className="plugins__providers-toggle"',
  'className="plugins__confirm-overlay"',
  'className="plugins__update-banner"',
  'className="plugins__settings-form"',
]) {
  if (pluginManagementView.includes(retiredInlinePluginSnippet)) {
    errors.push(
      `PluginManagementView must not inline extracted plugin-management UI ${retiredInlinePluginSnippet}.`,
    );
  }
}
for (const requiredHook of [
  'usePluginManagementViewModel',
  'PluginDetailPanel',
  'PluginEmptyState',
  'PluginModalStack',
]) {
  if (!pluginManagementView.includes(requiredHook)) {
    errors.push(`PluginManagementView must use shared SDK helper ${requiredHook}.`);
  }
}
for (const retiredInlinePluginLogic of [
  'usePluginSettingsQuery',
  'usePluginChangelogQuery',
  'usePluginProvidersQuery',
  'usePluginSettingsMutation',
  'useReloadPluginsMutation',
  'useCreateProjectMutation',
  'useAddProjectLayoutFromPluginMutation',
  'waitForAgentHealth',
  'async function install(',
  'function updatePlugin(',
  'function remove(',
]) {
  if (pluginManagementView.includes(retiredInlinePluginLogic)) {
    errors.push(
      `PluginManagementView must not inline extracted plugin-management logic ${retiredInlinePluginLogic}.`,
    );
  }
}

const pluginManagementViewModel = readFileSync(
  new URL('../src-ui/src/views/plugin-management/usePluginManagementViewModel.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function usePluginManagementViewModel',
  'usePluginSettingsQuery',
  'usePluginChangelogQuery',
  'usePluginProvidersQuery',
  'usePluginSettingsMutation',
  'useReloadPluginsMutation',
  'useCreateProjectMutation',
  'useAddProjectLayoutFromPluginMutation',
  'waitForAgentHealth',
  'toggleSetValue',
]) {
  if (!pluginManagementViewModel.includes(requiredHelper)) {
    errors.push(
      `plugin-management/usePluginManagementViewModel.ts must include ${requiredHelper}.`,
    );
  }
}

const pluginManagementUtils = readFileSync(
  new URL('../src-ui/src/views/plugin-management/view-utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function filterPlugins',
  'export function buildPluginListItems',
  'export function slugifyProjectName',
  'export function toggleSetValue',
]) {
  if (!pluginManagementUtils.includes(requiredHelper)) {
    errors.push(`plugin-management/view-utils.ts must include ${requiredHelper}.`);
  }
}

const pluginEmptyState = readFileSync(
  new URL('../src-ui/src/views/plugin-management/PluginEmptyState.tsx', import.meta.url),
  'utf8',
);
if (!pluginEmptyState.includes('export function PluginEmptyState')) {
  errors.push('PluginEmptyState.tsx must export PluginEmptyState.');
}

const pluginDetailPanel = readFileSync(
  new URL('../src-ui/src/views/plugin-management/PluginDetailPanel.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function PluginDetailPanel',
  'PluginSettingFieldRow',
  'className="plugins__providers-toggle"',
]) {
  if (!pluginDetailPanel.includes(requiredHelper)) {
    errors.push(`PluginDetailPanel.tsx must include ${requiredHelper}.`);
  }
}

const pluginModalStack = readFileSync(
  new URL('../src-ui/src/views/plugin-management/PluginModalStack.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function PluginModalStack',
  'InstallPluginModal',
  'LayoutAssignmentModal',
  'className="plugins__confirm-overlay"',
]) {
  if (!pluginModalStack.includes(requiredHelper)) {
    errors.push(`PluginModalStack.tsx must include ${requiredHelper}.`);
  }
}

const folderPickerModal = readFileSync(
  new URL('../src-ui/src/views/plugin-management/FolderPickerModal.tsx', import.meta.url),
  'utf8',
);
if (!folderPickerModal.includes('useFileSystemBrowseQuery')) {
  errors.push('FolderPickerModal must use useFileSystemBrowseQuery.');
}

const pluginRegistryModal = readFileSync(
  new URL('../src-ui/src/views/plugin-management/PluginRegistryModal.tsx', import.meta.url),
  'utf8',
);
for (const requiredHook of [
  'useRegistryPluginsQuery',
  'usePluginRegistryInstallMutation',
]) {
  if (!pluginRegistryModal.includes(requiredHook)) {
    errors.push(`PluginRegistryModal must use shared SDK helper ${requiredHook}.`);
  }
}

const installPluginModal = readFileSync(
  new URL('../src-ui/src/views/plugin-management/InstallPluginModal.tsx', import.meta.url),
  'utf8',
);
if (!installPluginModal.includes('PathAutocomplete')) {
  errors.push('InstallPluginModal must own the PathAutocomplete install input.');
}

const installPreviewModal = readFileSync(
  new URL('../src-ui/src/views/plugin-management/InstallPreviewModal.tsx', import.meta.url),
  'utf8',
);
if (!installPreviewModal.includes('previewData.dependencies')) {
  errors.push('InstallPreviewModal must render dependency preview details.');
}

const layoutAssignmentModal = readFileSync(
  new URL('../src-ui/src/views/plugin-management/LayoutAssignmentModal.tsx', import.meta.url),
  'utf8',
);
if (!layoutAssignmentModal.includes('selectedProjects.size')) {
  errors.push('LayoutAssignmentModal must render selected project assignment state.');
}

const agentsView = readFileSync(
  new URL('../src-ui/src/views/AgentsView.tsx', import.meta.url),
  'utf8',
);
if (agentsView.includes('fetch(')) {
  errors.push('AgentsView must not issue raw fetch() calls.');
}
for (const requiredImport of [
  './agent-editor/useAgentsViewModel',
]) {
  if (!agentsView.includes(requiredImport)) {
    errors.push(`AgentsView must delegate extracted helpers to ${requiredImport}.`);
  }
}
for (const retiredInlineAgentSnippet of [
  'const EMPTY_FORM: AgentFormData = {',
  'function formFromAgent(agent: any): AgentFormData {',
  'function isDirty(form: AgentFormData, saved: AgentFormData): boolean {',
  'const grouped: Record<string, Tool[]> = {};',
  'const [form, setForm] = useState<AgentFormData>(() => createEmptyAgentForm());',
  'const [savedForm, setSavedForm] = useState<AgentFormData>(() =>',
  'const [isSaving, setIsSaving] = useState(false);',
  'const [validationErrors, setValidationErrors] = useState<',
  'async function handleSave() {',
  'async function handleDelete() {',
]) {
  if (agentsView.includes(retiredInlineAgentSnippet)) {
    errors.push(`AgentsView must not inline extracted agent helper ${retiredInlineAgentSnippet}.`);
  }
}

const agentsViewModel = readFileSync(
  new URL('../src-ui/src/views/agent-editor/useAgentsViewModel.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useAgentsViewModel',
  'buildAgentPayload',
  'buildAgentsViewEmptyContent',
  'buildAgentsViewItems',
  'createEmptyAgentForm',
  'useUnsavedGuard',
]) {
  if (!agentsViewModel.includes(requiredHelper)) {
    errors.push(`useAgentsViewModel.ts must include ${requiredHelper}.`);
  }
}
for (const requiredHook of [
  'useAgentQuery',
  'useAgentTemplatesQuery',
  'useAgentToolsQuery',
  'useIntegrationsQuery',
  'useSkillsQuery',
  'usePromptsQuery',
]) {
  if (!agentsViewModel.includes(requiredHook)) {
    errors.push(`useAgentsViewModel.ts must use shared SDK hook ${requiredHook}.`);
  }
}

const layoutView = readFileSync(
  new URL('../src-ui/src/views/LayoutView.tsx', import.meta.url),
  'utf8',
);
if (layoutView.includes('/api/projects/${projectSlug}/layouts/${layoutSlug}')) {
  errors.push('LayoutView must not fetch project layouts directly.');
}
if (layoutView.includes('/api/prompts/')) {
  errors.push('LayoutView must not fetch prompt content directly.');
}
if (!layoutView.includes('useProjectLayoutQuery')) {
  errors.push('LayoutView must use the shared SDK project layout hook.');
}
if (!layoutView.includes('fetchPromptById')) {
  errors.push('LayoutView must resolve prompt content through shared SDK helpers.');
}
for (const retiredLayoutViewPattern of [
  'useLayoutQuery',
  'useLayoutsQuery',
  'setStandaloneLayout',
  'EmptyLayoutOnboarding',
]) {
  if (layoutView.includes(retiredLayoutViewPattern)) {
    errors.push(`LayoutView must not retain standalone-layout code path: ${retiredLayoutViewPattern}.`);
  }
}

const workflowManagementView = readFileSync(
  new URL('../src-ui/src/views/WorkflowManagementView.tsx', import.meta.url),
  'utf8',
);
if (workflowManagementView.includes('fetch(')) {
  errors.push('WorkflowManagementView must not issue raw fetch() calls.');
}
for (const requiredHook of [
  'useAgentWorkflowsQuery',
  'useWorkflowContentQuery',
  'useCreateWorkflowMutation',
  'useUpdateWorkflowMutation',
  'useDeleteWorkflowMutation',
]) {
  if (!workflowManagementView.includes(requiredHook)) {
    errors.push(`WorkflowManagementView must use shared SDK hook ${requiredHook}.`);
  }
}

const appView = readFileSync(
  new URL('../src-ui/src/App.tsx', import.meta.url),
  'utf8',
);
if (appView.includes('standalone-layout')) {
  errors.push('App must not expose standalone layout routes or views.');
}
if (appView.includes("'/layouts'") || appView.includes('"/layouts"')) {
  errors.push('App must not retain legacy /layouts route handling.');
}
if (appView.includes('LayoutsView')) {
  errors.push('App must not mount the legacy standalone layouts management view.');
}
if (appView.includes('/api/projects/${projectSlug}/layouts/${layoutSlug}')) {
  errors.push('App must not fetch project layout configs directly.');
}

const projectLayoutRendererView = readFileSync(
  new URL('../src-ui/src/app-shell/ProjectLayoutRenderer.tsx', import.meta.url),
  'utf8',
);
if (!projectLayoutRendererView.includes('useProjectLayoutQuery')) {
  errors.push('ProjectLayoutRenderer must use the shared SDK project layout hook.');
}

const runtimeFile = readFileSync(
  new URL('../src-server/runtime/stallion-runtime.ts', import.meta.url),
  'utf8',
);
if (runtimeFile.includes("app.route('/layouts'")) {
  errors.push('Runtime must not register legacy standalone /layouts routes.');
}

const pluginRoutes = readFileSync(
  new URL('../src-server/routes/plugins.ts', import.meta.url),
  'utf8',
);
if (!pluginRoutes.includes("./plugin-config-routes.js")) {
  errors.push('Plugin routes must delegate settings and metadata handlers to plugin-config-routes.ts.');
}
if (!pluginRoutes.includes("./plugin-lifecycle-routes.js")) {
  errors.push('Plugin routes must delegate lifecycle handlers to plugin-lifecycle-routes.ts.');
}
if (!pluginRoutes.includes("./plugin-install-routes.js")) {
  errors.push('Plugin routes must delegate discovery/install handlers to plugin-install-routes.ts.');
}
if (!pluginRoutes.includes("./plugin-public-routes.js")) {
  errors.push('Plugin routes must delegate public bundle/fetch handlers to plugin-public-routes.ts.');
}
if (!pluginRoutes.includes("./plugin-bundles.js")) {
  errors.push('Plugin routes must delegate bundle/build helpers to plugin-bundles.ts.');
}
for (const legacyHelper of [
  'async function fetchSource',
  'function detectConflicts',
  'async function resolveDependencies',
  'async function installDependency',
  'async function getGitInfo',
  'function extractPluginName',
  'async function loadProviders',
  'function resolvePluginBundle',
  'async function buildPlugin',
  'async function proxyFetch',
]) {
  if (pluginRoutes.includes(legacyHelper)) {
    errors.push(`Plugin routes must not inline legacy helper: ${legacyHelper}.`);
  }
}

const pluginConfigRoutes = readFileSync(
  new URL('../src-server/routes/plugin-config-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function registerPluginConfigRoutes',
  'pluginSettingsUpdates.add',
  "app.get('/:name/changelog'",
  "app.put('/:name/overrides'",
]) {
  if (!pluginConfigRoutes.includes(requiredHelper)) {
    errors.push(`plugin-config-routes.ts must include ${requiredHelper}.`);
  }
}

const pluginLifecycleRoutes = readFileSync(
  new URL('../src-server/routes/plugin-lifecycle-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function registerPluginLifecycleRoutes',
  "app.get('/check-updates'",
  "app.post('/:name/update'",
  "app.delete('/:name'",
  "app.post('/reload'",
]) {
  if (!pluginLifecycleRoutes.includes(requiredHelper)) {
    errors.push(`plugin-lifecycle-routes.ts must include ${requiredHelper}.`);
  }
}

const pluginInstallRoutes = readFileSync(
  new URL('../src-server/routes/plugin-install-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function registerPluginInstallRoutes',
  "app.get('/',",
  "app.post('/preview'",
  "app.post('/install'",
  "./plugin-install-shared.js",
  "./plugin-source.js",
  "./plugin-bundles.js",
]) {
  if (!pluginInstallRoutes.includes(requiredHelper)) {
    errors.push(`plugin-install-routes.ts must include ${requiredHelper}.`);
  }
}

const pluginPublicRoutes = readFileSync(
  new URL('../src-server/routes/plugin-public-routes.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function registerPluginPublicRoutes',
  "app.get('/:name/bundle.js'",
  "app.get('/:name/bundle.css'",
  "app.get('/:name/permissions'",
  "app.post('/:name/grant'",
  "app.post('/:name/fetch'",
  "app.post('/fetch'",
]) {
  if (!pluginPublicRoutes.includes(requiredHelper)) {
    errors.push(`plugin-public-routes.ts must include ${requiredHelper}.`);
  }
}

const pluginBundles = readFileSync(
  new URL('../src-server/routes/plugin-bundles.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function resolvePluginBundle',
  'export async function buildPlugin',
  "@stallion-ai/shared/build",
]) {
  if (!pluginBundles.includes(requiredHelper)) {
    errors.push(`plugin-bundles.ts must include ${requiredHelper}.`);
  }
}

const navigationTypes = readFileSync(
  new URL('../src-ui/src/types.ts', import.meta.url),
  'utf8',
);
for (const retiredView of [
  'standalone-layout',
  "type: 'layouts'",
  'layout-new',
  'layout-edit',
]) {
  if (navigationTypes.includes(retiredView)) {
    errors.push(`NavigationView must not include retired standalone layout view: ${retiredView}`);
  }
}

const mainEntry = readFileSync(
  new URL('../src-ui/src/main.tsx', import.meta.url),
  'utf8',
);
if (mainEntry.includes('LayoutsProvider')) {
  errors.push('main.tsx must not mount the retired LayoutsProvider.');
}

const pathAutocomplete = readFileSync(
  new URL('../src-ui/src/components/PathAutocomplete.tsx', import.meta.url),
  'utf8',
);
if (pathAutocomplete.includes('fetch(')) {
  errors.push('PathAutocomplete must not issue raw fetch() calls.');
}
if (!pathAutocomplete.includes('useFileSystemBrowseQuery')) {
  errors.push('PathAutocomplete must use the shared filesystem browse query.');
}

const navigationContext = readFileSync(
  new URL('../src-ui/src/contexts/NavigationContext.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of ['./navigation-store']) {
  if (!navigationContext.includes(requiredImport)) {
    errors.push(`NavigationContext.tsx must use ${requiredImport}.`);
  }
}
for (const retiredInlineNavigationSnippet of [
  'class NavigationStore',
  'const LAST_PROJECT_KEY =',
  'const LAST_PROJECT_LAYOUT_KEY =',
  'private parseUrl(): NavigationState',
  'private handlePopState = () =>',
  'export const navigationStore = new NavigationStore()',
]) {
  if (navigationContext.includes(retiredInlineNavigationSnippet)) {
    errors.push(
      `NavigationContext.tsx must not inline extracted navigation store helper ${retiredInlineNavigationSnippet}.`,
    );
  }
}

const navigationStoreFile = readFileSync(
  new URL('../src-ui/src/contexts/navigation-store.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export type NavigationState',
  'export class NavigationStore',
  'export const navigationStore = new NavigationStore()',
  'LAST_PROJECT_KEY',
  'private parseUrl(): NavigationState',
  'setDockModeQuiet(mode: DockMode)',
]) {
  if (!navigationStoreFile.includes(requiredHelper)) {
    errors.push(`navigation-store.ts must include ${requiredHelper}.`);
  }
}

const slashCommandsHook = readFileSync(
  new URL('../src-ui/src/hooks/useSlashCommands.ts', import.meta.url),
  'utf8',
);
if (slashCommandsHook.includes('fetch(')) {
  errors.push('useSlashCommands must not issue raw fetch() calls.');
}
for (const requiredHelper of [
  'useAcpCommandsQuery',
  'fetchAcpCommandOptions',
]) {
  if (!slashCommandsHook.includes(requiredHelper)) {
    errors.push(`useSlashCommands must use shared ACP command helper ${requiredHelper}.`);
  }
}

const sessionManagementViewModel = readFileSync(
  new URL('../src-ui/src/hooks/useSessionManagementViewModel.ts', import.meta.url),
  'utf8',
);
if (sessionManagementViewModel.includes('fetch(')) {
  errors.push('useSessionManagementViewModel must not issue raw fetch() calls.');
}
if (!sessionManagementViewModel.includes('conversationQueries.list')) {
  errors.push('useSessionManagementViewModel must use shared conversation query factories.');
}

const sessionManagementMenu = readFileSync(
  new URL('../src-ui/src/hooks/useSessionManagementMenu.ts', import.meta.url),
  'utf8',
);
if (sessionManagementMenu.includes('fetch(')) {
  errors.push('useSessionManagementMenu must not issue raw fetch() calls.');
}
for (const requiredHelper of [
  'useRenameConversationMutation',
  'useDeleteConversationMutation',
]) {
  if (!sessionManagementMenu.includes(requiredHelper)) {
    errors.push(`useSessionManagementMenu must use shared conversation helper ${requiredHelper}.`);
  }
}

const acpConnectionsHook = readFileSync(
  new URL('../src-ui/src/hooks/useACPConnections.ts', import.meta.url),
  'utf8',
);
if (acpConnectionsHook.includes('fetch(')) {
  errors.push('useACPConnections must not issue raw fetch() calls.');
}
if (!acpConnectionsHook.includes('useACPConnectionsQuery')) {
  errors.push('useACPConnections must delegate to the shared SDK ACP connections query.');
}

const acpConnectionsSection = readFileSync(
  new URL('../src-ui/src/components/ACPConnectionsSection.tsx', import.meta.url),
  'utf8',
);
if (acpConnectionsSection.includes('fetch(')) {
  errors.push('ACPConnectionsSection must not issue raw fetch() calls.');
}
for (const requiredHelper of [
  'useCreateACPConnectionMutation',
  'useUpdateACPConnectionMutation',
  'useDeleteACPConnectionMutation',
  'useReconnectACPConnectionMutation',
  './acp-connections/ACPConnectionCard',
  './acp-connections/ACPConnectionDetailModal',
  './acp-connections/ACPAddConnectionModal',
  './acp-connections/ConnectionIcon',
]) {
  if (!acpConnectionsSection.includes(requiredHelper)) {
    errors.push(`ACPConnectionsSection must use shared ACP helper ${requiredHelper}.`);
  }
}
for (const retiredInlineAcpConnectionsSnippet of [
  'function ConnectionIcon(',
  'function ConnectionCard(',
  'function AddConnectionModal(',
  'function ConnectionDetailModal(',
  'const statusLabel = isUnavailable',
  'const sectionLabel: React.CSSProperties =',
]) {
  if (acpConnectionsSection.includes(retiredInlineAcpConnectionsSnippet)) {
    errors.push(
      `ACPConnectionsSection must not inline extracted ACP UI ${retiredInlineAcpConnectionsSnippet}.`,
    );
  }
}

const acpConnectionCard = readFileSync(
  new URL('../src-ui/src/components/acp-connections/ACPConnectionCard.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ACPConnectionCard',
  './ConnectionIcon',
  './utils',
  '../ConfirmModal',
]) {
  if (!acpConnectionCard.includes(requiredHelper)) {
    errors.push(`ACPConnectionCard.tsx must include ${requiredHelper}.`);
  }
}

const acpConnectionDetailModal = readFileSync(
  new URL('../src-ui/src/components/acp-connections/ACPConnectionDetailModal.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ACPConnectionDetailModal',
  './ConnectionIcon',
  './utils',
]) {
  if (!acpConnectionDetailModal.includes(requiredHelper)) {
    errors.push(`ACPConnectionDetailModal.tsx must include ${requiredHelper}.`);
  }
}

const acpAddConnectionModal = readFileSync(
  new URL('../src-ui/src/components/acp-connections/ACPAddConnectionModal.tsx', import.meta.url),
  'utf8',
);
if (!acpAddConnectionModal.includes('export function ACPAddConnectionModal')) {
  errors.push('ACPAddConnectionModal.tsx must export ACPAddConnectionModal.');
}

const acpConnectionUtils = readFileSync(
  new URL('../src-ui/src/components/acp-connections/utils.ts', import.meta.url),
  'utf8',
);
if (!acpConnectionUtils.includes('export function getACPConnectionStatusView')) {
  errors.push('acp-connections/utils.ts must export getACPConnectionStatusView.');
}

const acpStatusBadge = readFileSync(
  new URL('../src-ui/src/components/ACPStatusBadge.tsx', import.meta.url),
  'utf8',
);
if (acpStatusBadge.includes('fetch(')) {
  errors.push('ACPStatusBadge must not issue raw fetch() calls.');
}
if (!acpStatusBadge.includes('useReconnectACPConnectionMutation')) {
  errors.push('ACPStatusBadge must use the shared ACP reconnect mutation.');
}

const usageStatsPanel = readFileSync(
  new URL('../src-ui/src/components/UsageStatsPanel.tsx', import.meta.url),
  'utf8',
);
if (usageStatsPanel.includes('fetch(')) {
  errors.push('UsageStatsPanel must not issue raw fetch() calls.');
}
if (!usageStatsPanel.includes('useResetUsageStatsMutation')) {
  errors.push('UsageStatsPanel must use the shared usage reset mutation.');
}
for (const requiredImport of [
  './usage-stats/UsageSummaryCards',
  './usage-stats/UsageBreakdownSection',
  './usage-stats/UsageDrillDownModal',
  './usage-stats/utils',
]) {
  if (!usageStatsPanel.includes(requiredImport)) {
    errors.push(`UsageStatsPanel must delegate extracted UI to ${requiredImport}.`);
  }
}
for (const retiredInlineUsageSnippet of [
  'function StatCard({',
  'function ModelRow({',
  'function AgentRow({',
  'function DrillDownModal({',
  'Object.entries(byModel',
  'Object.entries(byAgent',
  '? lifetime.totalCost / lifetime.totalMessages',
  ').totalConversations ??',
  ').totalSessions ??',
]) {
  if (usageStatsPanel.includes(retiredInlineUsageSnippet)) {
    errors.push(
      `UsageStatsPanel must not inline extracted usage-stats logic ${retiredInlineUsageSnippet}.`,
    );
  }
}

const usageStatsUtils = readFileSync(
  new URL('../src-ui/src/components/usage-stats/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getAverageCostPerMessage',
  'export function getTotalUsageConversations',
  'export function getTopUsageEntries',
  'export function getUsageModelDisplayName',
  'export function getUsageAgentsForModel',
  'export function getAgentModelBreakdown',
]) {
  if (!usageStatsUtils.includes(requiredHelper)) {
    errors.push(`usage-stats/utils.ts must include ${requiredHelper}.`);
  }
}

const insightsDashboard = readFileSync(
  new URL('../src-ui/src/components/InsightsDashboard.tsx', import.meta.url),
  'utf8',
);
if (insightsDashboard.includes('fetch(')) {
  errors.push('InsightsDashboard must not issue raw fetch() calls.');
}
for (const requiredHook of [
  'useAnalyzeFeedbackMutation',
  'useClearFeedbackAnalysisMutation',
  'useDeleteFeedbackRatingMutation',
]) {
  if (!insightsDashboard.includes(requiredHook)) {
    errors.push(`InsightsDashboard must use ${requiredHook}.`);
  }
}

const metricsPanel = readFileSync(
  new URL('../src-ui/src/components/monitoring/MetricsPanel.tsx', import.meta.url),
  'utf8',
);
if (metricsPanel.includes('fetch(')) {
  errors.push('MetricsPanel must not issue raw fetch() calls.');
}
if (!metricsPanel.includes('useMonitoringMetricsQuery')) {
  errors.push('MetricsPanel must use the shared monitoring metrics query.');
}

const monitoringView = readFileSync(
  new URL('../src-ui/src/views/MonitoringView.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './MonitoringTimeControls',
  './MonitoringLogControls',
  './MonitoringErrorBoundary',
  './monitoring/MonitoringHeader',
  './monitoring/MonitoringLogStream',
  './monitoring/MonitoringSidebar',
  './monitoring/MonitoringActiveFilters',
  './monitoring/useMonitoringFilters',
  './monitoring/view-utils',
  './monitoring-time-range',
]) {
  if (!monitoringView.includes(requiredImport)) {
    errors.push(`MonitoringView must use ${requiredImport}.`);
  }
}
for (const retiredInlineMonitoringSnippet of [
  'const elapsed = Date.now() - startTime.getTime();',
  'RELATIVE_TIME_OPTIONS.map((option) => {',
  'className="time-filter-button"',
  'className="search-wrapper"',
  'className="monitoring-header"',
  'className="monitoring-sidebar"',
  'className="active-filters-inline"',
  'class MonitoringErrorBoundary extends Component',
  '<EventEntry',
  'const [selectedAgents, setSelectedAgents] = useState<string[]>([]);',
  'const [selectedConversation, setSelectedConversation] = useState<',
  'const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(',
  'const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);',
  'const [eventTypeFilter, setEventTypeFilter] = useState<string[]>(',
  'const syncFiltersFromQuery = (query: string) => {',
  'const toggleEventType = (group: string) => {',
]) {
  if (monitoringView.includes(retiredInlineMonitoringSnippet)) {
    errors.push(
      `MonitoringView must not inline extracted monitoring control logic ${retiredInlineMonitoringSnippet}.`,
    );
  }
}
if (!monitoringView.includes('isLoading,')) {
  errors.push('MonitoringView must read isLoading from useMonitoring.');
}

const monitoringLogStream = readFileSync(
  new URL('../src-ui/src/views/monitoring/MonitoringLogStream.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function MonitoringLogStream',
  'EventEntry',
  'getEventType',
]) {
  if (!monitoringLogStream.includes(requiredHelper)) {
    errors.push(`MonitoringLogStream.tsx must include ${requiredHelper}.`);
  }
}

const monitoringFiltersHook = readFileSync(
  new URL('../src-ui/src/views/monitoring/useMonitoringFilters.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useMonitoringFilters',
  'parseMonitoringSearchQuery',
  'EVENT_TYPE_GROUPS',
]) {
  if (!monitoringFiltersHook.includes(requiredHelper)) {
    errors.push(`useMonitoringFilters.ts must include ${requiredHelper}.`);
  }
}

const projectSidebar = readFileSync(
  new URL('../src-ui/src/components/ProjectSidebar.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './project-sidebar/ProjectSidebarHeader',
  './project-sidebar/ProjectSidebarNav',
  './project-sidebar/ProjectSidebarRow',
  './project-sidebar/useProjectSidebarState',
  './project-sidebar/utils',
]) {
  if (!projectSidebar.includes(requiredImport)) {
    errors.push(`ProjectSidebar.tsx must use ${requiredImport}.`);
  }
}
for (const retiredInlineProjectSidebarSnippet of [
  'const NAV_ITEMS:',
  'function useIsMobile()',
  'function ProjectRow(',
  "const STORAGE_KEY = 'stallion-sidebar-collapsed';",
  'className="sidebar__header"',
  'className="sidebar__nav"',
]) {
  if (projectSidebar.includes(retiredInlineProjectSidebarSnippet)) {
    errors.push(
      `ProjectSidebar.tsx must not inline extracted sidebar helper ${retiredInlineProjectSidebarSnippet}.`,
    );
  }
}

const projectSidebarRow = readFileSync(
  new URL('../src-ui/src/components/project-sidebar/ProjectSidebarRow.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ProjectSidebarRow',
  '@stallion-ai/sdk',
  '../../contexts/NavigationContext',
  '../LayoutIcon',
]) {
  if (!projectSidebarRow.includes(requiredHelper)) {
    errors.push(`ProjectSidebarRow.tsx must include ${requiredHelper}.`);
  }
}

const projectSidebarHeader = readFileSync(
  new URL('../src-ui/src/components/project-sidebar/ProjectSidebarHeader.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ProjectSidebarHeader',
  'sidebar__header',
  'sidebar__toggle',
]) {
  if (!projectSidebarHeader.includes(requiredHelper)) {
    errors.push(`ProjectSidebarHeader.tsx must include ${requiredHelper}.`);
  }
}

const projectSidebarNav = readFileSync(
  new URL('../src-ui/src/components/project-sidebar/ProjectSidebarNav.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ProjectSidebarNav',
  './nav-items',
  'sidebar__nav',
  'sidebar__nav-btn',
]) {
  if (!projectSidebarNav.includes(requiredHelper)) {
    errors.push(`ProjectSidebarNav.tsx must include ${requiredHelper}.`);
  }
}

const projectSidebarState = readFileSync(
  new URL('../src-ui/src/components/project-sidebar/useProjectSidebarState.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useIsMobile',
  'export function useProjectSidebarState',
  './utils',
  "window.addEventListener('toggle-sidebar'",
]) {
  if (!projectSidebarState.includes(requiredHelper)) {
    errors.push(`useProjectSidebarState.ts must include ${requiredHelper}.`);
  }
}

const projectSidebarUtils = readFileSync(
  new URL('../src-ui/src/components/project-sidebar/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  "export const PROJECT_SIDEBAR_STORAGE_KEY = 'stallion-sidebar-collapsed';",
  'export function readInitialSidebarCollapsed',
  'export function buildSidebarClassName',
]) {
  if (!projectSidebarUtils.includes(requiredHelper)) {
    errors.push(`project-sidebar/utils.ts must include ${requiredHelper}.`);
  }
}

const scheduleView = readFileSync(
  new URL('../src-ui/src/views/ScheduleView.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './schedule/ScheduleStats',
  './schedule/ScheduleEmptyState',
  './schedule/ScheduleJobsTable',
  './schedule/utils',
]) {
  if (!scheduleView.includes(requiredImport)) {
    errors.push(`ScheduleView must delegate extracted schedule UI to ${requiredImport}.`);
  }
}
for (const retiredInlineScheduleSnippet of [
  'const statsMap = new Map<',
  'const utcHour = (localHour: number) => {',
  '<TableFilter',
  '<SortHeader',
  'className="schedule__starter-btn"',
  'className="schedule__table"',
  'className="schedule__stats"',
]) {
  if (scheduleView.includes(retiredInlineScheduleSnippet)) {
    errors.push(
      `ScheduleView must not inline extracted schedule UI ${retiredInlineScheduleSnippet}.`,
    );
  }
}

const scheduleUtils = readFileSync(
  new URL('../src-ui/src/views/schedule/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function getScheduleStatusTone',
  'export function getScheduleStatusLabel',
  'export function getScheduleStarterTemplates',
  'export function buildEnrichedSchedulerJobs',
]) {
  if (!scheduleUtils.includes(requiredHelper)) {
    errors.push(`schedule/utils.ts must include ${requiredHelper}.`);
  }
}

const monitoringViewUtils = readFileSync(
  new URL('../src-ui/src/views/monitoring/view-utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function filterMonitoringEvents',
  'export function getHistoricalAgentSlugs',
  'export function getMonitoringAgentCountLabel',
  'export function getRunningConversations',
]) {
  if (!monitoringViewUtils.includes(requiredHelper)) {
    errors.push(`monitoring/view-utils.ts must include ${requiredHelper}.`);
  }
}

const monitoringHeader = readFileSync(
  new URL('../src-ui/src/views/monitoring/MonitoringHeader.tsx', import.meta.url),
  'utf8',
);
if (!monitoringHeader.includes('export function MonitoringHeader')) {
  errors.push('MonitoringHeader.tsx must export MonitoringHeader.');
}

const monitoringSidebar = readFileSync(
  new URL('../src-ui/src/views/monitoring/MonitoringSidebar.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function MonitoringSidebar',
  'getMonitoringAgentCountLabel',
  'getRunningConversations',
]) {
  if (!monitoringSidebar.includes(requiredHelper)) {
    errors.push(`MonitoringSidebar.tsx must include ${requiredHelper}.`);
  }
}

const monitoringActiveFilters = readFileSync(
  new URL('../src-ui/src/views/monitoring/MonitoringActiveFilters.tsx', import.meta.url),
  'utf8',
);
if (!monitoringActiveFilters.includes('export function MonitoringActiveFilters')) {
  errors.push('MonitoringActiveFilters.tsx must export MonitoringActiveFilters.');
}

const monitoringErrorBoundary = readFileSync(
  new URL('../src-ui/src/views/MonitoringErrorBoundary.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'class MonitoringErrorBoundary extends Component',
  'export function MonitoringViewBoundary',
]) {
  if (!monitoringErrorBoundary.includes(requiredHelper)) {
    errors.push(`MonitoringErrorBoundary.tsx must include ${requiredHelper}.`);
  }
}

const monitoringTimeControls = readFileSync(
  new URL('../src-ui/src/views/MonitoringTimeControls.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function MonitoringTimeControls',
  'RELATIVE_TIME_OPTIONS.map((option) => {',
  'className="time-filter-button"',
  'live-mode-toggle',
]) {
  if (!monitoringTimeControls.includes(requiredHelper)) {
    errors.push(`MonitoringTimeControls.tsx must include ${requiredHelper}.`);
  }
}

const monitoringLogControls = readFileSync(
  new URL('../src-ui/src/views/MonitoringLogControls.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function MonitoringLogControls',
  'className="search-wrapper"',
  'className="autocomplete-dropdown"',
  'EVENT_TYPE_GROUPS',
]) {
  if (!monitoringLogControls.includes(requiredHelper)) {
    errors.push(`MonitoringLogControls.tsx must include ${requiredHelper}.`);
  }
}

const monitoringTimeRange = readFileSync(
  new URL('../src-ui/src/views/monitoring-time-range.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useMonitoringTimeRange',
  'export function getMonitoringElapsedLabel',
  'export function getMonitoringTimeLabel',
  'export function getMonitoringTimeSublabel',
  'export function toLocalDateTimeInput',
]) {
  if (!monitoringTimeRange.includes(requiredHelper)) {
    errors.push(`monitoring-time-range.ts must include ${requiredHelper}.`);
  }
}

const activeChatsContextSource = readFileSync(
  new URL('../src-ui/src/contexts/ActiveChatsContext.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './active-chats-store',
  '../hooks/useActiveChatSessions',
]) {
  if (!activeChatsContextSource.includes(requiredImport)) {
    errors.push(`ActiveChatsContext must use ${requiredImport}.`);
  }
}
for (const retiredInlineActiveChatHook of [
  'export function useSendMessage',
  'export function useCancelMessage',
  'export function useCreateChatSession',
  'export function useOpenConversation',
  'export function useRehydrateSessions',
  'const { sendMessage: sendToServer, fetchMessages } = useConversationActions();',
]) {
  if (activeChatsContextSource.includes(retiredInlineActiveChatHook)) {
    errors.push(
      `ActiveChatsContext must not inline extracted session hook logic ${retiredInlineActiveChatHook}.`,
    );
  }
}

const activeChatsStoreSource = readFileSync(
  new URL('../src-ui/src/contexts/active-chats-store.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export class ActiveChatsStore',
  'export const activeChatsStore = new ActiveChatsStore();',
  'setBackendMessagesResolver(',
  'const backendConversationId = chat.conversationId ?? sessionId;',
]) {
  if (!activeChatsStoreSource.includes(requiredHelper)) {
    errors.push(`active-chats-store.ts must include ${requiredHelper}.`);
  }
}
if (activeChatsStoreSource.includes('./ConversationsContext')) {
  errors.push('active-chats-store.ts must not depend directly on ConversationsContext.');
}

const activeChatSessions = readFileSync(
  new URL('../src-ui/src/hooks/useActiveChatSessions.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  "export {",
  './useActiveChatSessionLifecycle',
  './useActiveChatSessionMessaging',
]) {
  if (!activeChatSessions.includes(requiredHelper)) {
    errors.push(`useActiveChatSessions.ts must include ${requiredHelper}.`);
  }
}
for (const retiredActiveChatSessionSnippet of [
  'export function usePruneActiveChats',
  'export function useSendMessage',
  'export function useCancelMessage',
  'export function useCreateChatSession',
  'export function useOpenConversation',
  'export function useLaunchChat',
  'export function useRehydrateSessions',
]) {
  if (activeChatSessions.includes(retiredActiveChatSessionSnippet)) {
    errors.push(`useActiveChatSessions.ts must stay a thin barrel and not inline ${retiredActiveChatSessionSnippet}.`);
  }
}

const activeChatSessionLifecycle = readFileSync(
  new URL('../src-ui/src/hooks/useActiveChatSessionLifecycle.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function usePruneActiveChats',
  'export function useCreateChatSession',
  'export function useOpenConversation',
  'export function useLaunchChat',
  'export function useRehydrateSessions',
]) {
  if (!activeChatSessionLifecycle.includes(requiredHelper)) {
    errors.push(`useActiveChatSessionLifecycle.ts must include ${requiredHelper}.`);
  }
}

const activeChatSessionMessaging = readFileSync(
  new URL('../src-ui/src/hooks/useActiveChatSessionMessaging.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function useSendMessage',
  'export function useCancelMessage',
  './useOrchestration',
  './useStreamingMessage',
]) {
  if (!activeChatSessionMessaging.includes(requiredHelper)) {
    errors.push(`useActiveChatSessionMessaging.ts must include ${requiredHelper}.`);
  }
}

const projectPage = readFileSync(
  new URL('../src-ui/src/views/ProjectPage.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './project-page/ProjectPageHeader',
  './project-page/ProjectLayoutsSection',
  './project-page/ProjectKnowledgeSection',
  './project-page/ProjectConversationsSection',
]) {
  if (!projectPage.includes(requiredImport)) {
    errors.push(`ProjectPage must delegate extracted page sections to ${requiredImport}.`);
  }
}
for (const retiredInlineProjectPageSnippet of [
  'function timeAgo(iso: string)',
  'const [selectedNs, setSelectedNs] = useState<string | null>(null);',
  'const [showScanDialog, setShowScanDialog] = useState(false);',
  'className="project-page__knowledge"',
  'className="project-page__conversation-list"',
]) {
  if (projectPage.includes(retiredInlineProjectPageSnippet)) {
    errors.push(
      `ProjectPage must not inline extracted project page logic ${retiredInlineProjectPageSnippet}.`,
    );
  }
}

const projectPageUtils = readFileSync(
  new URL('../src-ui/src/views/project-page/utils.ts', import.meta.url),
  'utf8',
);
if (!projectPageUtils.includes('export function timeAgo')) {
  errors.push('project-page/utils.ts must include export function timeAgo.');
}

const projectKnowledgeSection = readFileSync(
  new URL('../src-ui/src/views/project-page/ProjectKnowledgeSection.tsx', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function ProjectKnowledgeSection',
  'useKnowledgeSearchQuery',
  'useKnowledgeDocContentQuery',
  'useKnowledgeScanMutation',
  './ProjectKnowledgeDocGroup',
  './ProjectKnowledgeNamespaceConfig',
  './ProjectKnowledgeRulesEditor',
  './ProjectKnowledgeScanModal',
  './ProjectKnowledgeViewerModal',
  'buildRulesContent',
  'splitKnowledgeDocs',
  'buildKnowledgeScanOptions',
]) {
  if (!projectKnowledgeSection.includes(requiredHelper)) {
    errors.push(`ProjectKnowledgeSection.tsx must include ${requiredHelper}.`);
  }
}
for (const retiredInlineProjectKnowledgeSnippet of [
  'function ProjectDocRow(',
  'className="project-page__rules-editor"',
  'className="project-page__doc-viewer"',
  'className="project-page__scan-warning"',
  'const filteredDocs = selectedNs',
  'const includePatterns = scanInclude',
]) {
  if (projectKnowledgeSection.includes(retiredInlineProjectKnowledgeSnippet)) {
    errors.push(
      `ProjectKnowledgeSection.tsx must not inline extracted project knowledge logic ${retiredInlineProjectKnowledgeSnippet}.`,
    );
  }
}

const projectPageUtilsExtended = readFileSync(
  new URL('../src-ui/src/views/project-page/utils.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function timeAgo',
  'export function buildRulesContent',
  'export function splitKnowledgeDocs',
  'export function buildKnowledgeScanOptions',
]) {
  if (!projectPageUtilsExtended.includes(requiredHelper)) {
    errors.push(`project-page/utils.ts must include ${requiredHelper}.`);
  }
}

const messageBubble = readFileSync(
  new URL('../src-ui/src/components/chat/MessageBubble.tsx', import.meta.url),
  'utf8',
);
if (messageBubble.includes('fetch(')) {
  errors.push('MessageBubble must not issue raw fetch() calls.');
}
for (const requiredImport of [
  './message-bubble/MessageContent',
  './message-bubble/MessageRating',
  './message-bubble/utils',
]) {
  if (!messageBubble.includes(requiredImport)) {
    errors.push(`MessageBubble must delegate extracted message bubble logic to ${requiredImport}.`);
  }
}
for (const retiredInlineMessageBubbleSnippet of [
  'function MessageRating(',
  'function getModelDisplayName(',
  'useFeedbackRatingsQuery',
  'useSaveFeedbackRatingMutation',
  'useDeleteFeedbackRatingMutation',
  'remarkPlugins={[remarkGfm]}',
]) {
  if (messageBubble.includes(retiredInlineMessageBubbleSnippet)) {
    errors.push(
      `MessageBubble must not inline extracted message bubble logic ${retiredInlineMessageBubbleSnippet}.`,
    );
  }
}
const messageBubbleUtils = readFileSync(
  new URL('../src-ui/src/components/chat/message-bubble/utils.ts', import.meta.url),
  'utf8',
);
if (!messageBubbleUtils.includes('export function getModelDisplayName')) {
  errors.push('message-bubble/utils.ts must export getModelDisplayName.');
}
const messageBubbleRating = readFileSync(
  new URL('../src-ui/src/components/chat/message-bubble/MessageRating.tsx', import.meta.url),
  'utf8',
);
for (const requiredHook of [
  'useFeedbackRatingsQuery',
  'useSaveFeedbackRatingMutation',
  'useDeleteFeedbackRatingMutation',
]) {
  if (!messageBubbleRating.includes(requiredHook)) {
    errors.push(`MessageRating.tsx must use ${requiredHook}.`);
  }
}

const connectionManagerModalContent = readFileSync(
  new URL('../packages/connect/src/react/ConnectionManagerModalContent.tsx', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './connection-manager-modal/ConnectionListPanel',
  './connection-manager-modal/ManualAddPanel',
]) {
  if (!connectionManagerModalContent.includes(requiredImport)) {
    errors.push(
      `ConnectionManagerModalContent.tsx must delegate extracted modal sections to ${requiredImport}.`,
    );
  }
}
for (const retiredInlineConnectionManagerSnippet of [
  'const inputStyle:',
  'const primaryBtnStyle:',
  'const secondaryBtnStyle:',
  'const iconBtnStyle:',
  '{connections.map((conn) =>',
]) {
  if (connectionManagerModalContent.includes(retiredInlineConnectionManagerSnippet)) {
    errors.push(
      `ConnectionManagerModalContent.tsx must not inline extracted modal logic ${retiredInlineConnectionManagerSnippet}.`,
    );
  }
}

const chatRoute = readFileSync(
  new URL('../src-server/routes/chat.ts', import.meta.url),
  'utf8',
);
if (!chatRoute.includes('./chat-request-preparation.js')) {
  errors.push('chat.ts must delegate request preparation to chat-request-preparation.ts.');
}
if (!chatRoute.includes('./chat-alternate-provider.js')) {
  errors.push('chat.ts must delegate alternate-provider streaming to chat-alternate-provider.ts.');
}
if (!chatRoute.includes('./chat-model-override.js')) {
  errors.push('chat.ts must delegate model-override agent resolution to chat-model-override.ts.');
}
if (!chatRoute.includes('./chat-primary-stream.js')) {
  errors.push('chat.ts must delegate primary agent streaming to chat-primary-stream.ts.');
}
for (const retiredInlineChatSnippet of [
  'await ctx.providerService.resolveProvider({',
  'await ctx.knowledgeService.getInjectContext(',
  'await ctx.knowledgeService.getRAGContext(',
  'const feedbackGuidelines = ctx.feedbackService.getBehaviorGuidelines();',
  'const llmProvider = createLLMProviderFromConfig(resolvedProviderConn);',
  'const cacheKey = `${slug}:${modelOverride}`;',
  '<conversation_feedback>',
  'feedbackOps.add(negativeRatings.length',
  'const combinedContext =',
  "ctx.logger.info('Created agent with model override'",
  'operationContext.conversationId = `${operationContext.userId}:',
  'const traceId = `${operationContext.conversationId}:',
  'await conversationStorage.createConversation({',
  'ctx.monitoringEmitter.emitAgentStart({',
  'ctx.monitoringEmitter.emitAgentComplete({',
  'ctx.metricsLog.push({',
  'chatRequests.add(1, { agent: slug, plugin });',
  'return stream(c, async (streamWriter) => {',
]) {
  if (chatRoute.includes(retiredInlineChatSnippet)) {
    errors.push(`chat.ts must not inline extracted chat request preparation logic ${retiredInlineChatSnippet}.`);
  }
}

const chatRequestPreparation = readFileSync(
  new URL('../src-server/routes/chat-request-preparation.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function prepareChatRequest',
  'export function extractChatUserText',
  'ctx.providerService.resolveProvider({',
  'ctx.knowledgeService.getInjectContext(',
  'ctx.knowledgeService.getRAGContext(',
  'ctx.feedbackService.getBehaviorGuidelines()',
]) {
  if (!chatRequestPreparation.includes(requiredHelper)) {
    errors.push(`chat-request-preparation.ts must include ${requiredHelper}.`);
  }
}

const chatAlternateProvider = readFileSync(
  new URL('../src-server/routes/chat-alternate-provider.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function buildAlternateProviderMessages',
  'export function streamAlternateProviderChat',
  'streamWithProvider(',
  'createLLMProviderFromConfig(',
]) {
  if (!chatAlternateProvider.includes(requiredHelper)) {
    errors.push(`chat-alternate-provider.ts must include ${requiredHelper}.`);
  }
}

const chatModelOverride = readFileSync(
  new URL('../src-server/routes/chat-model-override.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export async function resolveChatAgentModelOverride',
  'ctx.modelCatalog.validateModelId',
  'ctx.framework.createTempAgent',
  "ctx.activeAgents.set(cacheKey, resolvedAgent)",
]) {
  if (!chatModelOverride.includes(requiredHelper)) {
    errors.push(`chat-model-override.ts must include ${requiredHelper}.`);
  }
}

const chatContext = readFileSync(
  new URL('../src-server/routes/chat-context.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function injectConversationFeedbackContext',
  'export function applyCombinedContextToInput',
  '<conversation_feedback>',
  'feedbackOps.add(',
]) {
  if (!chatContext.includes(requiredHelper)) {
    errors.push(`chat-context.ts must include ${requiredHelper}.`);
  }
}

const chatPrimaryStream = readFileSync(
  new URL('../src-server/routes/chat-primary-stream.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function logDebugChatImages',
  'export function streamPrimaryAgentChat',
  './chat-context.js',
  './chat-persistence.js',
  './chat-lifecycle.js',
  "return stream(c, async (streamWriter) => {",
]) {
  if (!chatPrimaryStream.includes(requiredHelper)) {
    errors.push(`chat-primary-stream.ts must include ${requiredHelper}.`);
  }
}

const chatPersistence = readFileSync(
  new URL('../src-server/routes/chat-persistence.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function createChatConversationId',
  'export function createChatTraceId',
  'export async function ensureChatConversation',
  'export async function persistTemporaryAgentMessages',
  'getCachedUser().alias',
  'extractChatUserText',
]) {
  if (!chatPersistence.includes(requiredHelper)) {
    errors.push(`chat-persistence.ts must include ${requiredHelper}.`);
  }
}

const chatLifecycle = readFileSync(
  new URL('../src-server/routes/chat-lifecycle.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function emitChatAgentStart',
  'export async function ensureChatAgentStatsInitialized',
  'export async function finalizeChatRequest',
  'ctx.monitoringEmitter.emitAgentComplete',
  'chatRequests.add(1, { agent: slug, plugin });',
]) {
  if (!chatLifecycle.includes(requiredHelper)) {
    errors.push(`chat-lifecycle.ts must include ${requiredHelper}.`);
  }
}

const codexAdapter = readFileSync(
  new URL('../src-server/providers/adapters/codex-adapter.ts', import.meta.url),
  'utf8',
);
if (!codexAdapter.includes('./codex-adapter-events.js')) {
  errors.push('codex-adapter.ts must delegate protocol/event mapping helpers to codex-adapter-events.ts.');
}
for (const retiredInlineCodexHelper of [
  'function mapServerRequestToEvent(',
  'function buildApprovalResult(',
  'function deriveToolName(',
  'function deriveToolArguments(',
  'function deriveToolOutput(',
  'function extractToolError(',
  'function extractThread(',
  'function extractTurn(',
  "case 'thread/status/changed':",
  "case 'item/agentMessage/delta':",
  "case 'item/reasoning/textDelta':",
  "case 'thread/tokenUsage/updated':",
  "case 'item/started':",
  "case 'item/completed':",
  "case 'turn/completed':",
  "case 'error':",
  'private handleItemStarted(',
  'private handleItemCompleted(',
]) {
  if (codexAdapter.includes(retiredInlineCodexHelper)) {
    errors.push(
      `codex-adapter.ts must not inline extracted helper ${retiredInlineCodexHelper}.`,
    );
  }
}

const codexAdapterTransport = readFileSync(
  new URL('../src-server/providers/adapters/codex-adapter-transport.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  './codex-adapter-notifications.js',
  './codex-adapter-types.js',
  'export class CodexAdapterTransport',
  'export function createCodexSessionRecord',
  'handleCodexNotification({',
]) {
  if (!codexAdapterTransport.includes(requiredHelper)) {
    errors.push(`codex-adapter-transport.ts must include ${requiredHelper}.`);
  }
}

const codexAdapterEvents = readFileSync(
  new URL('../src-server/providers/adapters/codex-adapter-events.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function mapServerRequestToEvent',
  'export function buildApprovalResult',
  'export function mapApprovalResolutionStatus',
  'export function deriveToolName',
  'export function deriveToolArguments',
  'export function deriveToolOutput',
  'export function extractThread',
  'export function extractTurn',
]) {
  if (!codexAdapterEvents.includes(requiredHelper)) {
    errors.push(`codex-adapter-events.ts must include ${requiredHelper}.`);
  }
}

const codexAdapterNotifications = readFileSync(
  new URL('../src-server/providers/adapters/codex-adapter-notifications.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function handleCodexNotification',
  "case 'thread/status/changed':",
  "case 'item/started':",
  "case 'turn/completed':",
  "provider: 'codex'",
]) {
  if (!codexAdapterNotifications.includes(requiredHelper)) {
    errors.push(`codex-adapter-notifications.ts must include ${requiredHelper}.`);
  }
}

const codexAdapterTypes = readFileSync(
  new URL('../src-server/providers/adapters/codex-adapter-types.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export interface CodexProcessLike',
  'export interface PendingRpcRequest',
  'export interface PendingApprovalRequest',
  'export interface CodexSessionRecord',
]) {
  if (!codexAdapterTypes.includes(requiredHelper)) {
    errors.push(`codex-adapter-types.ts must include ${requiredHelper}.`);
  }
}

const claudeAdapter = readFileSync(
  new URL('../src-server/providers/adapters/claude-adapter.ts', import.meta.url),
  'utf8',
);
for (const requiredHelperImport of [
  './claude-adapter-events.js',
  './claude-adapter-queues.js',
]) {
  if (!claudeAdapter.includes(requiredHelperImport)) {
    errors.push(`claude-adapter.ts must delegate extracted helper logic to ${requiredHelperImport}.`);
  }
}
for (const retiredInlineClaudeHelper of [
  'class AsyncEventQueue',
  'class AsyncUserMessageQueue',
  'private mapSessionState(',
  "message.type === 'system' &&",
  "message.type === 'stream_event'",
  "message.type === 'tool_progress'",
  "message.type === 'result'",
]) {
  if (claudeAdapter.includes(retiredInlineClaudeHelper)) {
    errors.push(`claude-adapter.ts must not inline extracted helper ${retiredInlineClaudeHelper}.`);
  }
}

const claudeAdapterEvents = readFileSync(
  new URL('../src-server/providers/adapters/claude-adapter-events.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export function mapClaudeSdkMessage',
  'export function mapClaudeSessionState',
  "method: 'session.state-changed'",
  "method: 'content.text-delta'",
  "method: 'tool.progress'",
  "method: 'turn.completed'",
]) {
  if (!claudeAdapterEvents.includes(requiredHelper)) {
    errors.push(`claude-adapter-events.ts must include ${requiredHelper}.`);
  }
}

const claudeAdapterQueues = readFileSync(
  new URL('../src-server/providers/adapters/claude-adapter-queues.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export class AsyncEventQueue',
  'export class AsyncUserMessageQueue',
  'createDeferred<',
]) {
  if (!claudeAdapterQueues.includes(requiredHelper)) {
    errors.push(`claude-adapter-queues.ts must include ${requiredHelper}.`);
  }
}

const stallionControlServer = readFileSync(
  new URL('../src-server/tools/stallion-control-server.ts', import.meta.url),
  'utf8',
);
for (const requiredImport of [
  './stallion-control-agent-tools.js',
  './stallion-control-catalog-tools.js',
  './stallion-control-operations-tools.js',
  './stallion-control-platform-tools.js',
  'registerAgentTools(server);',
  'registerCatalogTools(server);',
  'registerOperationsTools(server);',
  'registerPlatformTools(server);',
]) {
  if (!stallionControlServer.includes(requiredImport)) {
    errors.push(`stallion-control-server.ts must include ${requiredImport}.`);
  }
}
for (const retiredInlineControlSnippet of [
  "server.tool('list_agents'",
  "server.tool('list_skills'",
  "server.tool('list_integrations'",
  "server.tool('list_jobs'",
  "server.tool('send_message'",
  "server.tool('list_plugins'",
  'const API = `http://localhost:',
  'async function api(path: string',
]) {
  if (stallionControlServer.includes(retiredInlineControlSnippet)) {
    errors.push(
      `stallion-control-server.ts must not inline extracted control-server logic ${retiredInlineControlSnippet}.`,
    );
  }
}

const stallionControlShared = readFileSync(
  new URL('../src-server/tools/stallion-control-shared.ts', import.meta.url),
  'utf8',
);
for (const requiredHelper of [
  'export const API',
  'export async function api',
  'export function resolveControlApiBase',
  'export function jsonToolResult',
  'export function buildAnalyticsUsagePath',
  'export function buildChatRequest',
  'export function createConversationId',
  'export function buildSentMessageResult',
  'export async function dispatchAgentMessage',
  'export async function navigateTo',
]) {
  if (!stallionControlShared.includes(requiredHelper)) {
    errors.push(`stallion-control-shared.ts must include ${requiredHelper}.`);
  }
}
if (!stallionControlShared.includes('env.STALLION_API_BASE')) {
  errors.push('stallion-control-shared.ts must prefer STALLION_API_BASE over an implicit localhost default.');
}

for (const [relativePath, requiredExports] of [
  [
    '../src-server/tools/stallion-control-agent-tools.ts',
    ['export function registerAgentTools', "'list_agents'", "'list_conversations'"],
  ],
  [
    '../src-server/tools/stallion-control-catalog-tools.ts',
    ['export function registerCatalogTools', "'list_skills'", "'list_prompts'"],
  ],
  [
    '../src-server/tools/stallion-control-operations-tools.ts',
    ['export function registerOperationsTools', "'list_jobs'", "'send_message'", "'get_usage'"],
  ],
  [
    '../src-server/tools/stallion-control-platform-tools.ts',
    ['export function registerPlatformTools', "'list_integrations'", "'list_plugins'", "'create_provider'"],
  ],
]) {
  const fileContents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  for (const requiredExport of requiredExports) {
    if (!fileContents.includes(requiredExport)) {
      errors.push(`${relativePath} must include ${requiredExport}.`);
    }
  }
}

for (const deletedPath of [
  '../src-ui/src/views/LayoutsView.tsx',
  '../src-ui/src/views/LayoutEditorView.tsx',
  '../src-ui/src/contexts/LayoutsContext.tsx',
  '../src-ui/src/contexts/WorkflowsContext.tsx',
]) {
  if (existsSync(new URL(deletedPath, import.meta.url))) {
    errors.push(`${deletedPath.replace('../', '')} must be removed after standalone layout retirement.`);
  }
}

const externalActionPattern =
  /^\s*-\s+uses:\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)\s*$/gm;
const fullCommitShaPattern = /^[0-9a-f]{40}$/;
for (const fileName of readdirSync(workflowDir)) {
  if (!fileName.endsWith('.yml')) {
    continue;
  }

  const relativePath = join('.github/workflows', fileName);
  const contents = readFileSync(
    new URL(`../${relativePath}`, import.meta.url),
    'utf8',
  );
  let match;
  while ((match = externalActionPattern.exec(contents)) !== null) {
    const [, actionName, ref] = match;
    if (!fullCommitShaPattern.test(ref)) {
      errors.push(
        `${relativePath} uses unpinned action ${actionName}@${ref}. Pin to a full commit SHA.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Convergence verification failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Convergence verification passed.');
