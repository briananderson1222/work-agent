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
      <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>
        Loading insights...
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--color-text)', margin: 0 }}>SIFT Queue</h2>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer'
          }}
        >
          Create Insight
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid var(--color-border)',
            borderRadius: '0.25rem',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)'
          }}
        >
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      {filteredInsights.length === 0 ? (
        <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>
          No insights found.
        </div>
      ) : (
        <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-bg)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Category</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Title</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Account</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Date</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Salesforce</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--color-text)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInsights.map((insight) => (
                  <tr key={insight.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'white',
                        backgroundColor: categoryColors[insight.category] || 'var(--color-text-secondary)'
                      }}>
                        {insight.category}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text)' }}>{insight.title}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {insight.accountName || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {insight.createdDate.toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {insight.status || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <a
                        href={`${CRM_BASE_URL}/lightning/r/SIFT_Insight__c/${insight.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem'
                        }}
                      >
                        🔗
                      </a>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <button
                        onClick={() => handleDelete(insight.id)}
                        disabled={deleteSift.isPending}
                        style={{
                          padding: '0.25rem 0.5rem',
                          border: '1px solid #ef4444',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
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