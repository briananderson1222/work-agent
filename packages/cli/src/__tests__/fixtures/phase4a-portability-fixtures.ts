export type PortabilityRoundTripDisposition =
  | 'preserved'
  | 'degraded'
  | 'ignored';

export interface PortabilityRoundTripExpectation {
  fieldId: string;
  domain:
    | 'workspace-guidance'
    | 'managed-agent-guidance'
    | 'mcp-tooling'
    | 'approval-delegation'
    | 'import-notes';
  exportSection: string;
  disposition: PortabilityRoundTripDisposition;
  lossReportCode?: string;
  importBehavior:
    | 'restore-to-canonical-config'
    | 'restore-as-note'
    | 'warn-and-ignore';
  rationale: string;
}

export interface PortabilityLossReportWarning {
  fieldId: string;
  code: string;
  severity: 'info' | 'warning';
  message: string;
  importBehavior:
    | 'restore-to-canonical-config'
    | 'restore-as-note'
    | 'warn-and-ignore';
}

export interface PortabilityLossReport {
  format: 'agents-md';
  version: 1;
  warnings: PortabilityLossReportWarning[];
}

export const phase4aAgentsExportRequiredSections = [
  'Stallion Workspace Guidance',
  'Stallion Managed-Agent Guidance',
  'Stallion MCP and Tool Expectations',
  'Stallion Portability Loss Report',
] as const;

export const phase4aRoundTripMatrix: PortabilityRoundTripExpectation[] = [
  {
    fieldId: 'workspace.guidance',
    domain: 'workspace-guidance',
    exportSection: 'Stallion Workspace Guidance',
    disposition: 'preserved',
    importBehavior: 'restore-to-canonical-config',
    rationale:
      'Structured workspace guidance is Stallion-owned and must round-trip without degradation.',
  },
  {
    fieldId: 'managedAgents.guidance',
    domain: 'managed-agent-guidance',
    exportSection: 'Stallion Managed-Agent Guidance',
    disposition: 'preserved',
    importBehavior: 'restore-to-canonical-config',
    rationale:
      'Managed-agent guidance is deterministic configuration and should restore directly into canonical agent config.',
  },
  {
    fieldId: 'mcp.expectations',
    domain: 'mcp-tooling',
    exportSection: 'Stallion MCP and Tool Expectations',
    disposition: 'preserved',
    importBehavior: 'restore-to-canonical-config',
    rationale:
      'Representable MCP and tool expectations belong in the structured export and must survive re-import.',
  },
  {
    fieldId: 'approval.policy',
    domain: 'approval-delegation',
    exportSection: 'Stallion MCP and Tool Expectations',
    disposition: 'degraded',
    lossReportCode: 'approval_policy_downgraded',
    importBehavior: 'restore-as-note',
    rationale:
      'Approval policy can be documented, but AGENTS.md cannot fully preserve runtime enforcement semantics.',
  },
  {
    fieldId: 'delegation.policy',
    domain: 'approval-delegation',
    exportSection: 'Stallion Managed-Agent Guidance',
    disposition: 'degraded',
    lossReportCode: 'delegation_policy_downgraded',
    importBehavior: 'restore-as-note',
    rationale:
      'Delegation policy is only partially representable in prose guidance and must round-trip with an explicit downgrade marker.',
  },
  {
    fieldId: 'prose.unstructuredNotes',
    domain: 'import-notes',
    exportSection: 'Stallion Workspace Guidance',
    disposition: 'degraded',
    lossReportCode: 'unstructured_prose_preserved_as_note',
    importBehavior: 'restore-as-note',
    rationale:
      'Free-form prose should be preserved for operators, but imported as notes rather than trusted config.',
  },
  {
    fieldId: 'prose.conflictsWithStructuredSection',
    domain: 'import-notes',
    exportSection: 'Stallion Workspace Guidance',
    disposition: 'ignored',
    lossReportCode: 'conflicting_prose_ignored',
    importBehavior: 'warn-and-ignore',
    rationale:
      'When prose contradicts a structured Stallion-owned section, the structured block wins and the conflict must be surfaced.',
  },
];

export const phase4aLossReportFixture: PortabilityLossReport = {
  format: 'agents-md',
  version: 1,
  warnings: [
    {
      fieldId: 'approval.policy',
      code: 'approval_policy_downgraded',
      severity: 'warning',
      message:
        'Approval policy is exported as guidance only and must be re-confirmed on import.',
      importBehavior: 'restore-as-note',
    },
    {
      fieldId: 'delegation.policy',
      code: 'delegation_policy_downgraded',
      severity: 'warning',
      message:
        'Delegation policy is only partially representable in AGENTS.md and is restored as imported notes.',
      importBehavior: 'restore-as-note',
    },
    {
      fieldId: 'prose.unstructuredNotes',
      code: 'unstructured_prose_preserved_as_note',
      severity: 'info',
      message:
        'Unstructured prose is preserved for review but not trusted as deterministic Stallion config.',
      importBehavior: 'restore-as-note',
    },
    {
      fieldId: 'prose.conflictsWithStructuredSection',
      code: 'conflicting_prose_ignored',
      severity: 'warning',
      message:
        'Conflicting prose is retained in import warnings, but the structured Stallion-owned section wins.',
      importBehavior: 'warn-and-ignore',
    },
  ],
};

export const phase4aAgentsMdFixture = `# AGENTS.md

## Stallion Workspace Guidance

- Default posture: use Stallion-owned structured sections as the import source of truth.
- Preserve any unmatched prose as imported notes.

<!-- stallion:workspace-guidance:start -->
\`\`\`yaml
version: 1
workspaceGuidance:
  defaultMode: solo
  notesPolicy: preserve-as-note
\`\`\`
<!-- stallion:workspace-guidance:end -->

## Stallion Managed-Agent Guidance

<!-- stallion:managed-agent-guidance:start -->
\`\`\`yaml
version: 1
managedAgents:
  assistant:
    guidance:
      promptStyle: concise
      reasoningEffort: high
\`\`\`
<!-- stallion:managed-agent-guidance:end -->

## Stallion MCP and Tool Expectations

<!-- stallion:mcp-tooling:start -->
\`\`\`yaml
version: 1
mcp:
  servers:
    github:
      enabled: true
toolExpectations:
  approvals:
    mode: guidance-only
\`\`\`
<!-- stallion:mcp-tooling:end -->

## Stallion Portability Loss Report

<!-- stallion:loss-report:start -->
\`\`\`json
${JSON.stringify(phase4aLossReportFixture, null, 2)}
\`\`\`
<!-- stallion:loss-report:end -->
`;
