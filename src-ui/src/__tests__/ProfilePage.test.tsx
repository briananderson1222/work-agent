/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const analyticsState = vi.hoisted(() => ({
  loading: false,
  usageStats: {
    lifetime: {
      totalMessages: 18,
      totalCost: 2.75,
      firstMessageDate: '2026-04-01T10:00:00Z',
    },
    byModel: {},
    byAgent: {},
    byDate: Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        return [
          `2026-04-${day}`,
          { messages: index % 3 === 0 ? index + 1 : 0, cost: index * 0.05 },
        ];
      }),
    ),
  },
}));

vi.mock('@stallion-ai/sdk', () => ({
  AuthStatusBadge: () => <div>Auth badge</div>,
}));

vi.mock('../components/AchievementsBadge', () => ({
  AchievementsBadge: () => <div>Achievements</div>,
}));

vi.mock('../components/ActivityTimeline', () => ({
  ActivityTimeline: () => <div>Timeline</div>,
}));

vi.mock('../components/InsightsDashboard', () => ({
  InsightsDashboard: () => <div>Insights</div>,
}));

vi.mock('../components/UsageStatsPanel', () => ({
  UsageStatsPanel: () => <div>Usage stats</div>,
}));

vi.mock('../components/UserDetailModal', () => ({
  UserDetailModal: () => null,
}));

vi.mock('../components/UserIcon', () => ({
  UserIcon: () => <div>User icon</div>,
}));

vi.mock('../contexts/AnalyticsContext', () => ({
  useAnalytics: () => analyticsState,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      name: 'Casey Example',
      alias: 'casey',
      email: 'casey@example.com',
      title: 'Operator',
    },
  }),
}));

vi.mock('../core/PluginRegistry', () => ({
  pluginRegistry: {
    getLinks: () => [],
  },
}));

import { ProfilePage } from '../pages/ProfilePage';

describe('ProfilePage', () => {
  beforeEach(() => {
    analyticsState.loading = false;
  });

  test('renders a compact populated usage graph inside the hero card', () => {
    const { container } = render(<ProfilePage />);

    expect(screen.getByLabelText('Usage activity overview')).toBeTruthy();
    expect(screen.getByText(/Recent activity/)).toBeTruthy();
    expect(
      container.querySelectorAll('.profile-usage-graph__bar'),
    ).toHaveLength(14);
  });

  test('renders the empty hero graph state when no recent usage exists', () => {
    analyticsState.usageStats = {
      lifetime: {
        totalMessages: 0,
        totalCost: 0,
        firstMessageDate: '',
      },
      byModel: {},
      byAgent: {},
      byDate: {},
    };

    render(<ProfilePage />);

    expect(screen.getByText(/No usage data yet/i)).toBeTruthy();
  });
});
