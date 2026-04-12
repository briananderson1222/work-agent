import { describe, expect, test } from 'vitest';
import {
  deriveWorkflowPlanArtifact,
  toWorkflowPlanArtifact,
} from '../components/WorkflowPlanPanel';
import type { ChatMessage } from '../types';
import type { PlanArtifact } from '../utils/planArtifacts';

describe('deriveWorkflowPlanArtifact', () => {
  test('parses plan steps from reasoning updates', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        timestamp: 1700000000000,
        contentParts: [
          {
            type: 'reasoning',
            content:
              '✅ Capture requirements\n🔄 Build workflow panel\n⬜ Verify coding layout visibility',
          },
        ],
      },
    ];

    const artifact = deriveWorkflowPlanArtifact(messages);

    expect(artifact).not.toBeNull();
    expect(artifact?.steps).toEqual([
      {
        id: 'plan-step-0',
        label: 'Capture requirements',
        status: 'completed',
      },
      {
        id: 'plan-step-1',
        label: 'Build workflow panel',
        status: 'in_progress',
      },
      {
        id: 'plan-step-2',
        label: 'Verify coding layout visibility',
        status: 'pending',
      },
    ]);
    expect(artifact?.markdown).toContain('# Workflow plan');
  });

  test('prefers the latest assistant plan markdown', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '# Earlier plan\n\n- [x] Done',
        timestamp: 1,
      },
      {
        role: 'assistant',
        content: '# Shipping plan\n\n- [x] Wire data\n- [ ] Render panel',
        timestamp: 2,
      },
    ];

    const artifact = deriveWorkflowPlanArtifact(messages);

    expect(artifact?.title).toBe('Shipping plan');
    expect(artifact?.steps).toHaveLength(2);
    expect(artifact?.markdown).toContain('# Shipping plan');
  });

  test('returns null when content is not plan-like', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'General status update without any plan structure.',
        timestamp: 1,
      },
    ];

    expect(deriveWorkflowPlanArtifact(messages)).toBeNull();
  });

  test('preserves in-progress status when converting cached plan artifacts', () => {
    const artifact: PlanArtifact = {
      source: 'reasoning',
      rawText:
        '✅ Capture requirements\n⏳ Build workflow panel\n⬜ Verify layout',
      steps: [
        { content: 'Capture requirements', status: 'completed' },
        { content: 'Build workflow panel', status: 'in_progress' },
        { content: 'Verify layout', status: 'pending' },
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const workflowArtifact = toWorkflowPlanArtifact(artifact);

    expect(workflowArtifact?.markdown).toContain('- [>] Build workflow panel');
    expect(workflowArtifact?.steps[1]).toMatchObject({
      label: 'Build workflow panel',
      status: 'in_progress',
    });
  });
});
