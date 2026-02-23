import React, { useState, useMemo } from 'react';
import { useSiftQueue, useDeleteSift } from './data';
import { LeadershipInsightModal } from './LeadershipInsightModal';
import { CRM_BASE_URL } from './constants';
import './workspace.css';

const categoryColors: Record<string, string> = {
  Highlight: '#22c55e',
  Risk: '#ef4444',
  Observation: '#3b82f6',
  Challenge: '#f59e0b',
  Lowlight: '#f97316',
  Blocker: '#ef4444',
};

const categories = ['All', 'Highlight', 'Lowlight', 'Risk', 'Observation', 'Blocker', 'Challenge'];

export function SiftQueue() {
  const { data: insights = [], isLoading } = useSiftQueue();
  const deleteSift = useDeleteSift();
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredInsights = useMemo(() => {
    if (selectedCategory === 'All') return insights;
    return insights.filter(insight => insight.category === selectedCategory);
  }, [insights, selectedCategory]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSift.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete insight:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="workspace-dashboard__loading">
        <span className="workspace-dashboard__spinner" /> Loading insights…
      </div>
    );
  }

  return (
    <div className="workspace-dashboard__sift-container">
      <div className="workspace-dashboard__sift-header">
        <h2 className="workspace-dashboard__title">SIFT Queue</h2>
        <button className="workspace-dashboard__btn workspace-dashboard__btn--primary" onClick={() => setShowModal(true)}>
          Create Insight
        </button>
      </div>

      <div className="workspace-dashboard__sift-filters">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="workspace-dashboard__select"
        >
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      {filteredInsights.length === 0 ? (
        <div className="workspace-dashboard__empty">
          <div className="workspace-dashboard__empty-title">No insights found</div>
        </div>
      ) : (
        <div className="workspace-dashboard__card workspace-dashboard__sift-table-wrap">
          <div className="workspace-dashboard__sift-scroll">
            <table className="workspace-dashboard__table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Segment</th>
                  <th>Date</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredInsights.map((insight) => (
                  <tr key={insight.id}>
                    <td>
                      <span className="workspace-dashboard__category-badge"
                        style={{ backgroundColor: categoryColors[insight.category] || 'var(--color-text-secondary)' }}>
                        {insight.category}
                      </span>
                    </td>
                    <td>
                      {insight.title}
                      {insight.opportunityName && (
                        <div className="workspace-dashboard__cell--secondary" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                          {insight.opportunityName}
                        </div>
                      )}
                    </td>
                    <td className="workspace-dashboard__cell--secondary">{insight.segment || insight.industry || '—'}</td>
                    <td className="workspace-dashboard__cell--secondary">{insight.createdDate.toLocaleDateString()}</td>
                    <td>
                      <a
                        href={insight.salesforceUrl || `${CRM_BASE_URL}/lightning/r/SIFT_Insight__c/${insight.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="workspace-dashboard__sfdc-link"
                        title="Open in Salesforce"
                      >
                        ↗
                      </a>
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(insight.id)}
                        disabled={deleteSift.isPending}
                        className="workspace-dashboard__btn workspace-dashboard__btn--danger workspace-dashboard__btn--sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LeadershipInsightModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        agentSlug="work-agent"
      />
    </div>
  );
}
