import type { UIBlock } from '@stallion-ai/contracts/ui-block';

type UIBlockCarrier = {
  uiBlock?: unknown;
  uiBlocks?: unknown;
};

export function extractUIBlocks(output: unknown): UIBlock[] {
  if (!output || typeof output !== 'object') {
    return [];
  }

  const carrier = output as UIBlockCarrier;
  const candidates = [
    ...(carrier.uiBlock ? [carrier.uiBlock] : []),
    ...(Array.isArray(carrier.uiBlocks) ? carrier.uiBlocks : []),
  ];

  return candidates
    .map(normalizeUIBlock)
    .filter((block): block is UIBlock => block !== null);
}

function normalizeUIBlock(value: unknown): UIBlock | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const block = value as Record<string, unknown>;
  if (block.type === 'card' && typeof block.body === 'string') {
    return {
      type: 'card',
      id: typeof block.id === 'string' ? block.id : undefined,
      title: typeof block.title === 'string' ? block.title : undefined,
      body: block.body,
      tone: normalizeTone(block.tone),
      fields: Array.isArray(block.fields)
        ? block.fields
            .map((field) =>
              field &&
              typeof field === 'object' &&
              typeof (field as Record<string, unknown>).label === 'string' &&
              typeof (field as Record<string, unknown>).value === 'string'
                ? {
                    label: (field as Record<string, unknown>).label as string,
                    value: (field as Record<string, unknown>).value as string,
                  }
                : null,
            )
            .filter(
              (field): field is { label: string; value: string } =>
                field !== null,
            )
        : undefined,
    };
  }

  if (
    block.type === 'table' &&
    Array.isArray(block.columns) &&
    Array.isArray(block.rows)
  ) {
    const columns = block.columns.filter(
      (column): column is string => typeof column === 'string',
    );
    const rows = block.rows
      .map((row) =>
        Array.isArray(row)
          ? row.map((cell) =>
              typeof cell === 'string' ||
              typeof cell === 'number' ||
              typeof cell === 'boolean' ||
              cell === null
                ? cell
                : String(cell),
            )
          : null,
      )
      .filter(
        (row): row is Array<string | number | boolean | null> => row !== null,
      );

    if (columns.length === 0) {
      return null;
    }

    return {
      type: 'table',
      id: typeof block.id === 'string' ? block.id : undefined,
      title: typeof block.title === 'string' ? block.title : undefined,
      caption: typeof block.caption === 'string' ? block.caption : undefined,
      columns,
      rows,
    };
  }

  return null;
}

function normalizeTone(
  tone: unknown,
): 'default' | 'success' | 'warning' | 'danger' | undefined {
  return tone === 'success' ||
    tone === 'warning' ||
    tone === 'danger' ||
    tone === 'default'
    ? tone
    : undefined;
}
