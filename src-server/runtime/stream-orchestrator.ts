/**
 * Streaming orchestration functions
 * Handles streaming pipeline setup, handler creation, and SSE output
 */

import { StreamPipeline } from './streaming/StreamPipeline.js';
import { ReasoningHandler } from './streaming/handlers/ReasoningHandler.js';
import { ElicitationHandler } from './streaming/handlers/ElicitationHandler.js';
import { TextDeltaHandler } from './streaming/handlers/TextDeltaHandler.js';
import { ToolCallHandler } from './streaming/handlers/ToolCallHandler.js';
import { CompletionHandler } from './streaming/handlers/CompletionHandler.js';
import { MetadataHandler } from './streaming/handlers/MetadataHandler.js';
import { InjectableStream } from './streaming/InjectableStream.js';
import { parseToolName } from '../utils/tool-name-normalizer.js';
import type { AgentSpec } from '../domain/types.js';
import type { ApprovalRegistry } from '../services/approval-registry.js';
import { isAutoApproved } from './tool-executor.js';

// Type extensions for stream orchestrator
interface ToolApprovalRequestChunk {
  type: 'tool-approval-request';
  approvalId: string;
  toolName: string;
  server: string | null;
  tool: string;
  toolDescription: string;
  toolArgs: any;
}

/**
 * Create elicitation callback for tool approval
 */
export function createElicitationCallback(
  agentSpec: AgentSpec,
  toolNameMapping: Map<string, { original: string; normalized: string; server: string | null; tool: string }>,
  approvalRegistry: ApprovalRegistry,
  injectableStream: InjectableStream,
  logger: any
) {
  const autoApprove = agentSpec?.tools?.autoApprove || [];
  
  return async (request: any) => {
    if (request.type === 'tool-approval') {
      const toolName = request.toolName;
      
      // Check if auto-approved (check both normalized and original names)
      const isApproved = isAutoApproved(toolName, autoApprove);
      
      // Also check if the original (non-normalized) name matches
      const toolMapping = Array.from(toolNameMapping.values()).find(
        m => m.normalized === toolName
      );
      const isApprovedOriginal = toolMapping ? isAutoApproved(toolMapping.original, autoApprove) : false;
      
      if (isApproved || isApprovedOriginal) {
        logger.info('[Elicitation] Auto-approved, returning true immediately', { 
          toolName,
          originalName: toolMapping?.original,
          matched: isApproved ? 'normalized' : 'original'
        });
        return true;
      }
      
      // Not auto-approved - inject approval request into stream
      const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Parse tool name for UI display
      const { server, tool } = parseToolName(toolName);
      
      logger.info('[Elicitation] NOT auto-approved, injecting approval request', {
        approvalId,
        toolName,
        originalName: toolMapping?.original,
        autoApproveList: autoApprove
      });
      
      // Inject event (will appear at next chunk boundary)
      injectableStream.inject({
        type: 'tool-approval-request',
        approvalId,
        toolName,
        server,
        tool,
        toolDescription: request.toolDescription,
        toolArgs: request.toolArgs,
      } as unknown as any);
      
      // Wait for user approval
      return approvalRegistry.register(approvalId);
    }
    return false;
  };
}

/**
 * Create and configure streaming pipeline
 */
export function createStreamingPipeline(
  abortSignal: AbortSignal,
  monitoringEvents: any,
  contextData: {
    slug: string;
    conversationId: string | undefined;
    userId: string | undefined;
    traceId: string;
  }
): StreamPipeline {
  const pipeline = new StreamPipeline(abortSignal);
  const completionHandler = new CompletionHandler();
  const metadataHandler = new MetadataHandler(monitoringEvents, contextData);
  
  // Add handlers in order (elicitation handled via callback + injectable stream)
  pipeline
    .use(new ReasoningHandler({ enableThinking: true }))
    .use(new TextDeltaHandler())
    .use(new ToolCallHandler())
    .use(metadataHandler)
    .use(completionHandler);
    
  return pipeline;
}

/**
 * Write SSE chunk to stream
 */
export async function writeSSEChunk(streamWriter: any, chunk: any): Promise<void> {
  await streamWriter.write(`data: ${JSON.stringify(chunk)}\n\n`);
  // Force flush by yielding to event loop with setTimeout(0)
  // setImmediate doesn't flush network buffers, but setTimeout does
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Write SSE done marker
 */
export async function writeSSEDone(streamWriter: any): Promise<void> {
  await streamWriter.write('data: [DONE]\n\n');
}

/**
 * Write SSE error
 */
export async function writeSSEError(streamWriter: any, error: any): Promise<void> {
  const isCredentialError = error.message?.includes('credential') || 
                           error.message?.includes('accessKeyId') ||
                           error.message?.includes('secretAccessKey');
  await streamWriter.write(`data: ${JSON.stringify({ 
    type: 'error', 
    errorText: error.message,
    statusCode: isCredentialError ? 401 : undefined
  })}\n\n`);
}

/**
 * Save cancellation message when stream is aborted
 */
export async function saveCancellationMessage(
  agent: any,
  operationContext: any
): Promise<void> {
  const mem = agent.getMemory();
  if (mem && operationContext.conversationId && operationContext.userId) {
    await mem.addMessage(
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text: '_⚠️ Response cancelled by user_' }]
      },
      operationContext.userId,
      operationContext.conversationId
    );
  }
}