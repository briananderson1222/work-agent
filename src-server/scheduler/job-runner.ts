/**
 * Job execution engine
 * Executes scheduled job actions against the VoltAgent runtime
 */

import { randomUUID } from 'crypto';
import type { Agent } from '@voltagent/core';
import type { EventEmitter } from 'events';
import type {
  JobAction,
  AgentConversationAction,
  ToolInvocationAction,
  WorkflowAction,
  JobExecution,
  SchedulerEvent,
} from './job-types.js';

export interface JobRunnerDeps {
  getAgent: (slug: string) => Agent | undefined;
  monitoringEvents: EventEmitter;
}

export class JobRunner {
  private deps: JobRunnerDeps;

  constructor(deps: JobRunnerDeps) {
    this.deps = deps;
  }

  /** Execute a job action and return the execution record */
  async execute(jobId: string, jobName: string, action: JobAction): Promise<JobExecution> {
    const execution: JobExecution = {
      id: randomUUID(),
      jobId,
      jobName,
      startedAt: new Date().toISOString(),
      status: 'running',
    };

    this.emitEvent({
      type: 'scheduler:job:started',
      jobId,
      jobName,
      timestamp: execution.startedAt,
    });

    const start = Date.now();

    try {
      let result: string;

      switch (action.type) {
        case 'agent-conversation':
          result = await this.executeAgentConversation(action);
          break;
        case 'tool-invocation':
          result = await this.executeToolInvocation(action);
          break;
        case 'workflow':
          result = await this.executeWorkflow(execution, action);
          break;
        default:
          throw new Error(`Unknown action type: ${(action as any).type}`);
      }

      execution.status = 'success';
      execution.result = result;
      execution.durationMs = Date.now() - start;
      execution.completedAt = new Date().toISOString();

      this.emitEvent({
        type: 'scheduler:job:completed',
        jobId,
        jobName,
        timestamp: execution.completedAt,
        durationMs: execution.durationMs,
        result: result.length > 200 ? result.slice(0, 200) + '...' : result,
      });
    } catch (error: any) {
      execution.status = 'failure';
      execution.error = error.message || String(error);
      execution.durationMs = Date.now() - start;
      execution.completedAt = new Date().toISOString();

      this.emitEvent({
        type: 'scheduler:job:failed',
        jobId,
        jobName,
        timestamp: execution.completedAt || new Date().toISOString(),
        error: execution.error || 'Unknown error',
      });
    }

    return execution;
  }

  private async executeAgentConversation(action: AgentConversationAction): Promise<string> {
    const agent = this.deps.getAgent(action.agentSlug);
    if (!agent) {
      throw new Error(`Agent not found: ${action.agentSlug}`);
    }

    const result = await agent.generateText(action.message, {});
    return result.text || '';
  }

  private async executeToolInvocation(action: ToolInvocationAction): Promise<string> {
    // Tool invocations go through an agent with an explicit instruction
    // to call the specified tool. This leverages the existing MCP infrastructure.
    const agent = this.deps.getAgent('default');
    if (!agent) {
      throw new Error('Default agent not available for tool invocation');
    }

    const prompt = [
      `Execute the following tool and return only its result:`,
      `Tool: ${action.toolServer}__${action.toolName}`,
      `Parameters: ${JSON.stringify(action.parameters)}`,
      `Call this tool immediately with exactly these parameters. Return the tool's output verbatim.`,
    ].join('\n');

    const result = await agent.generateText(prompt, {});
    return result.text || '';
  }

  private async executeWorkflow(
    execution: JobExecution,
    action: WorkflowAction
  ): Promise<string> {
    const variables = new Map<string, string>();
    const stepResults: NonNullable<JobExecution['stepResults']> = [];

    for (const step of action.steps) {
      const stepStart = Date.now();

      try {
        let result: string;

        if (step.type === 'agent-conversation') {
          // Substitute variables in the message
          let message = step.message || '';
          for (const [varName, varValue] of variables) {
            message = message.replaceAll(`{{${varName}}}`, varValue);
          }

          result = await this.executeAgentConversation({
            type: 'agent-conversation',
            agentSlug: step.agentSlug || 'default',
            message,
          });
        } else if (step.type === 'tool-invocation') {
          // Substitute variables in parameters
          const params = JSON.parse(
            substituteVariables(JSON.stringify(step.parameters || {}), variables)
          );

          result = await this.executeToolInvocation({
            type: 'tool-invocation',
            toolName: step.toolName || '',
            toolServer: step.toolServer || '',
            parameters: params,
          });
        } else {
          throw new Error(`Unknown step type: ${(step as any).type}`);
        }

        // Store output variable if specified
        if (step.outputVariable) {
          variables.set(step.outputVariable, result);
        }

        stepResults.push({
          stepId: step.id,
          status: 'success',
          result: result.length > 500 ? result.slice(0, 500) + '...' : result,
          durationMs: Date.now() - stepStart,
        });
      } catch (error: any) {
        stepResults.push({
          stepId: step.id,
          status: 'failure',
          error: error.message || String(error),
          durationMs: Date.now() - stepStart,
        });

        // Fail the workflow on first step failure
        execution.stepResults = stepResults;
        throw new Error(`Workflow failed at step "${step.id}": ${error.message}`);
      }
    }

    execution.stepResults = stepResults;

    // Return the last step's result as the workflow result
    const lastResult = stepResults[stepResults.length - 1];
    return lastResult?.result || 'Workflow completed';
  }

  private emitEvent(event: SchedulerEvent): void {
    this.deps.monitoringEvents.emit('event', event);
  }
}

/** Replace {{varName}} placeholders in a string */
function substituteVariables(text: string, variables: Map<string, string>): string {
  let result = text;
  for (const [name, value] of variables) {
    result = result.replaceAll(`{{${name}}}`, value);
  }
  return result;
}
