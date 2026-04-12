type ToolContentPart = {
  type: string;
  tool?: {
    activityAt?: string;
    name?: string;
    toolName?: string;
    state?: string;
    progressMessage?: string;
  };
};

export interface ToolProgressSummary {
  label: string;
  toolName: string;
}

function normalizeProgressMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatToolName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'tool';
  }
  return value.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function activityTimestamp(tool: ToolContentPart['tool']): number {
  if (!tool?.activityAt) {
    return Number.NEGATIVE_INFINITY;
  }
  const timestamp = Date.parse(tool.activityAt);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function deriveToolProgressSummary(
  contentParts: ToolContentPart[] | undefined,
): ToolProgressSummary | null {
  if (!contentParts || contentParts.length === 0) {
    return null;
  }

  const runningToolParts = contentParts.filter(
    (part) => part.type === 'tool' && part.tool?.state === 'running',
  );

  if (runningToolParts.length === 0) {
    return null;
  }

  const runningToolPart = runningToolParts.reduce((latest, candidate) =>
    activityTimestamp(candidate.tool) >= activityTimestamp(latest.tool)
      ? candidate
      : latest,
  );

  if (!runningToolPart?.tool) {
    return null;
  }

  const toolName = formatToolName(
    runningToolPart.tool.toolName ?? runningToolPart.tool.name,
  );
  const progressMessage = normalizeProgressMessage(
    runningToolPart.tool.progressMessage,
  );

  return {
    label: progressMessage ?? `Running ${toolName}`,
    toolName,
  };
}
