import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import {
  AgentEditorLoadingState,
  AgentEditorNotFoundState,
  AgentEditorTemplatePicker,
} from '../views/agent-editor/AgentEditorStateViews';

describe('agent editor state views', () => {
  test('AgentEditorLoadingState renders the loading copy', () => {
    expect(
      renderToStaticMarkup(createElement(AgentEditorLoadingState)),
    ).toContain('Loading agent...');
  });

  test('AgentEditorNotFoundState renders the recovery action', () => {
    expect(
      renderToStaticMarkup(
        createElement(AgentEditorNotFoundState, {
          selectedSlug: 'planner',
          onDeselect: () => {},
        }),
      ),
    ).toContain(
      'The agent &quot;planner&quot; doesn&#x27;t exist or was deleted.',
    );
  });

  test('AgentEditorTemplatePicker renders template cards and blank action', () => {
    const markup = renderToStaticMarkup(
      createElement(AgentEditorTemplatePicker, {
        templates: [
          {
            id: 'template-1',
            icon: '✨',
            label: 'Template One',
            description: 'Template description',
            form: { name: 'Template One' },
          },
        ] as any,
        onPickTemplate: () => {},
        onStartBlank: () => {},
      }),
    );

    expect(markup).toContain('Start with a template');
    expect(markup).toContain('Template One');
    expect(markup).toContain('Template description');
    expect(markup).toContain('Start Blank →');
  });
});
