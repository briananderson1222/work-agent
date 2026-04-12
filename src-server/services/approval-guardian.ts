import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type {
  AppConfig,
  ApprovalGuardianConfig,
} from '@stallion-ai/contracts/config';
import { jsonSchema } from 'ai';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { createRuntimeFrameworkModel } from '../runtime/runtime-provider-resolution.js';
import type { IAgentFramework } from '../runtime/types.js';
import { approvalGuardianOps } from '../telemetry/metrics.js';

export interface ApprovalGuardianReviewInput {
  agentName?: string;
  agentSlug: string;
  conversationId?: string;
  toolArgs: unknown;
  toolDescription?: string;
  toolName: string;
}

export interface ApprovalGuardianDecision {
  decision: 'allow' | 'defer' | 'deny';
  reason: string;
}

interface ApprovalGuardianDeps {
  appConfig: AppConfig;
  framework: IAgentFramework;
  logger: any;
  modelCatalog?: BedrockModelCatalog;
  projectHomeDir: string;
}

const DEFAULT_GUARDIAN_PROMPT = `
You are Stallion's approval guardian.

Review a proposed tool call for safety, scope, and alignment with likely user intent.

Decision rules:
- Return "allow" only when the action is clearly scoped, low-risk, and consistent with the agent's task.
- Return "deny" when the action appears destructive, exfiltrative, tries to bypass approvals or safety controls, or is clearly out of scope.
- Return "defer" when the request is ambiguous and a human should decide.

Prefer "defer" over "allow" when uncertain.
Return concise reasoning grounded in the provided tool call only.
`.trim();

export class ApprovalGuardianService {
  readonly config?: ApprovalGuardianConfig;

  constructor(private readonly deps: ApprovalGuardianDeps) {
    this.config = deps.appConfig.approvalGuardian;
  }

  isEnabled(): boolean {
    return this.config?.enabled === true;
  }

  getMode(): 'review' | 'enforce' {
    return this.config?.mode === 'enforce' ? 'enforce' : 'review';
  }

  async reviewToolCall(
    input: ApprovalGuardianReviewInput,
  ): Promise<ApprovalGuardianDecision> {
    if (!this.isEnabled()) {
      approvalGuardianOps.add(1, { action: 'skipped', reason: 'disabled' });
      return { decision: 'defer', reason: 'Guardian disabled.' };
    }

    approvalGuardianOps.add(1, { action: 'requested' });

    try {
      const model = await createRuntimeFrameworkModel(
        {
          name: 'Approval Guardian',
          prompt: '',
          model: this.config?.model || this.deps.appConfig.structureModel,
        } as AgentSpec,
        {
          framework: this.deps.framework,
          appConfig: this.deps.appConfig,
          projectHomeDir: this.deps.projectHomeDir,
          modelCatalog: this.deps.modelCatalog,
        },
      );

      const agent = await this.deps.framework.createTempAgent({
        name: 'approval-guardian',
        instructions: this.config?.instructions || DEFAULT_GUARDIAN_PROMPT,
        model,
        tools: [],
        maxSteps: 1,
      });

      const prompt = buildGuardianPrompt(input);
      const fallbackDecision = {
        decision: 'defer',
        reason: 'Guardian could not parse a confident decision.',
      } satisfies ApprovalGuardianDecision;

      const objectResult = agent.generateObject
        ? await agent.generateObject(prompt, {
            structuredOutputSchema: jsonSchema({
              type: 'object',
              additionalProperties: false,
              required: ['decision', 'reason'],
              properties: {
                decision: {
                  type: 'string',
                  enum: ['allow', 'deny', 'defer'],
                },
                reason: {
                  type: 'string',
                  minLength: 1,
                },
              },
            }),
            conversationId: input.conversationId || `guardian-${Date.now()}`,
            userId: 'approval-guardian',
          })
        : null;

      const decision = normalizeGuardianDecision(
        objectResult?.object as Partial<ApprovalGuardianDecision> | undefined,
      );
      const resolvedDecision = decision ?? fallbackDecision;

      approvalGuardianOps.add(1, { action: resolvedDecision.decision });
      return resolvedDecision;
    } catch (error) {
      this.deps.logger.warn('Approval guardian review failed', {
        toolName: input.toolName,
        error,
      });
      approvalGuardianOps.add(1, { action: 'error' });
      return { decision: 'defer', reason: 'Guardian review failed.' };
    }
  }
}

function buildGuardianPrompt(input: ApprovalGuardianReviewInput): string {
  return [
    `Agent: ${input.agentName || input.agentSlug}`,
    `Tool: ${input.toolName}`,
    input.toolDescription ? `Tool description: ${input.toolDescription}` : null,
    `Arguments: ${JSON.stringify(input.toolArgs, null, 2)}`,
    '',
    'Decide whether Stallion should allow, deny, or defer this tool call.',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeGuardianDecision(
  value: Partial<ApprovalGuardianDecision> | undefined,
): ApprovalGuardianDecision | null {
  if (
    !value ||
    (value.decision !== 'allow' &&
      value.decision !== 'deny' &&
      value.decision !== 'defer') ||
    typeof value.reason !== 'string' ||
    value.reason.trim().length === 0
  ) {
    return null;
  }

  return {
    decision: value.decision,
    reason: value.reason.trim(),
  };
}
