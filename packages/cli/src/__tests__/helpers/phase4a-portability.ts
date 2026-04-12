import type {
  PortabilityLossReport,
  PortabilityRoundTripExpectation,
} from '../fixtures/phase4a-portability-fixtures.js';

export function extractMarkdownHeadings(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.match(/^##\s+(.*)$/)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
}

export function extractLossReport(markdown: string): PortabilityLossReport {
  const match = markdown.match(
    /<!-- stallion:loss-report:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- stallion:loss-report:end -->/,
  );

  if (!match) {
    throw new Error('Missing machine-readable Stallion loss report block');
  }

  return JSON.parse(match[1]) as PortabilityLossReport;
}

export function mapRoundTripByFieldId(
  matrix: PortabilityRoundTripExpectation[],
): Map<string, PortabilityRoundTripExpectation> {
  return new Map(matrix.map((entry) => [entry.fieldId, entry]));
}

export function fieldsRequiringLossWarnings(
  matrix: PortabilityRoundTripExpectation[],
): string[] {
  return matrix
    .filter((entry) => entry.disposition !== 'preserved')
    .map((entry) => entry.fieldId);
}
