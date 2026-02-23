import React, { useState, useMemo, useEffect } from 'react';
import { useWorkspaceNavigation } from '@stallion-ai/sdk';
import { useSiftQueue, useSiftInsight, useDeleteSift, useEnrichSift } from './data';
import { LeadershipInsightModal } from './LeadershipInsightModal';
import { CRM_BASE_URL } from './constants';
import { useSortableTable, SortHeader, TableFilter } from './components/SortableTable';
import { transformTool } from '@stallion-ai/sdk';
import './workspace.css';
import { log } from './log';

const categoryColors: Record<string, string> = {
  Highlight: '#22c55e', Risk: '#ef4444', Observation: '#3b82f6',
  Challenge: '#f59e0b', Lowlight: '#f97316', Blocker: '#ef4444',
};
const categories = ['All', 'Highlight', 'Lowlight', 'Risk', 'Observation', 'Blocker', 'Challenge'];

function SiftDetailModal({ insightId, onClose }: { insightId: string; onClose: () => void }) {
  const { data: insight, isLoading } = useSiftInsight(insightId);
  const [enrichment, setEnrichment] = useState<any>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState<any>(null);
  const enrichSift = useEnrichSift();

  // Fetch enrichment if available
  useEffect(() => {
    if (!insight?.enrichmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await transformTool('work-agent', 'sat-sfdc_sift_assistant_fetchEnrichInsightResponse',
          { enrichmentId: insight.enrichmentId }, 'data => data?.data || data');
        if (!cancelled) setEnrichment(r);
      } catch { /* no enrichment */ }
    })();
    return () => { cancelled = true; };
  }, [insight?.enrichmentId]);

  const handleEnrich = async () => {
    if (!insight) return;
    setEnrichLoading(true);
    try {
      const r = await enrichSift.mutateAsync({ text: insight.description || insight.title });
      setEnrichResult(r);
    } catch (e: any) {
      log('Enrich failed:', e);
    } finally {
      setEnrichLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: 'var(--color-bg, #1a1a2e)', borderRadius: 8, padding: '1.5rem', width: '90%', maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            {insight && <span className="workspace-dashboard__category-badge" style={{ backgroundColor: categoryColors[insight.category] || '#6b7280' }}>{insight.category}</span>}
            <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.1rem' }}>{isLoading ? 'Loading...' : insight?.title}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-secondary)' }}>✕</button>
        </div>

        {insight && (
          <>
            {insight.description && (
              <div style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem', color: 'var(--color-text)' }}>
                {insight.description}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {insight.segment && <div><strong>Segment:</strong> {insight.segment}</div>}
              {insight.industry && <div><strong>Industry:</strong> {insight.industry}</div>}
              {insight.geo && <div><strong>Geo:</strong> {insight.geo}</div>}
              {insight.source && <div><strong>Source:</strong> {insight.source}</div>}
              {insight.opportunityName && <div><strong>Opportunity:</strong> {insight.opportunityName}</div>}
              <div><strong>Created:</strong> {insight.createdDate.toLocaleDateString()}</div>
            </div>

            {/* Enrichment */}
            {enrichment && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.85rem' }}>✨ Enrichment</div>
                <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--color-text)' }}>
                  {typeof enrichment === 'string' ? enrichment : JSON.stringify(enrichment, null, 2)}
                </pre>
              </div>
            )}

            {enrichResult && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--color-primary)' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.85rem' }}>✨ New Enrichment</div>
                <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--color-text)' }}>
                  {typeof enrichResult === 'string' ? enrichResult : JSON.stringify(enrichResult, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={handleEnrich} disabled={enrichLoading}
                style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent', color: 'var(--text-primary)', opacity: enrichLoading ? 0.5 : 1 }}>
                {enrichLoading ? 'Enriching...' : '✨ Enrich'}
              </button>
              <a href={insight.salesforceUrl || `${CRM_BASE_URL}/lightning/r/SIFT_Insight__c/${insight.id}/view`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--border-primary)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--color-primary)', textDecoration: 'none' }}>
                Open in Salesforce ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SiftQueue() {
  const { data: insights = [], isLoading, error } = useSiftQueue();
  const deleteSift = useDeleteSift();
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const { getTabState } = useWorkspaceNavigation();

  // Deep link from Portfolio
  useEffect(() => {
    const state = getTabState('sift-queue');
    if (state) {
      const params = new URLSearchParams(state);
      const id = params.get('insight');
      if (id) setSelectedInsightId(id);
    }
  }, []);

  const filteredInsights = useMemo(() => {
    if (selectedCategory === 'All') return insights;
    return insights.filter(insight => insight.category === selectedCategory);
  }, [insights, selectedCategory]);

  const { sorted: sortedInsights, sortKey, sortDir, toggle, filterText, setFilterText } =
    useSortableTable(filteredInsights, 'createdDate', 'desc', ['title', 'opportunityName', 'segment']);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try { await deleteSift.mutateAsync(id); } catch (err) { log('Failed to delete insight:', err); }
  };

  if (isLoading) {
    return <div className="workspace-dashboard__loading"><span className="workspace-dashboard__spinner" /> Loading insights…</div>;
  }

  return (
    <div className="workspace-dashboard__sift-container">
      <div className="workspace-dashboard__sift-header">
        <h2 className="workspace-dashboard__title">SIFT Queue ({insights.length})</h2>
        <button className="workspace-dashboard__btn workspace-dashboard__btn--primary" onClick={() => setShowModal(true)}>
          Create Insight
        </button>
      </div>

      <div className="workspace-dashboard__sift-filters">
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="workspace-dashboard__select">
          {categories.map(c => <option key={c} value={c}>{c}{c !== 'All' ? ` (${insights.filter(i => i.category === c).length})` : ''}</option>)}
        </select>
        <TableFilter value={filterText} onChange={setFilterText} placeholder="Search insights…" />
      </div>

      {error ? (
        <div className="workspace-dashboard__empty workspace-dashboard__empty--error">
          <div>⚠ Failed to load insights</div>
          <div className="workspace-dashboard__error-detail">{(error as Error)?.message}</div>
        </div>
      ) : sortedInsights.length === 0 ? (
        <div className="workspace-dashboard__empty"><div className="workspace-dashboard__empty-title">No insights found</div></div>
      ) : (
        <div className="workspace-dashboard__card workspace-dashboard__sift-table-wrap">
          <div className="workspace-dashboard__sift-scroll">
            <table className="workspace-dashboard__table">
              <thead>
                <tr>
                  <SortHeader label="Category" sortKey="category" active={sortKey === 'category'} dir={sortDir} onClick={toggle} />
                  <SortHeader label="Title" sortKey="title" active={sortKey === 'title'} dir={sortDir} onClick={toggle} />
                  <SortHeader label="Segment" sortKey="segment" active={sortKey === 'segment'} dir={sortDir} onClick={toggle} />
                  <SortHeader label="Date" sortKey="createdDate" active={sortKey === 'createdDate'} dir={sortDir} onClick={toggle} />
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedInsights.map((insight) => (
                  <tr key={insight.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedInsightId(insight.id)}>
                    <td>
                      <span className="workspace-dashboard__category-badge"
                        style={{ backgroundColor: categoryColors[insight.category] || 'var(--color-text-secondary)' }}>
                        {insight.category}
                      </span>
                    </td>
                    <td>
                      {insight.title}
                      {insight.opportunityName && (
                        <div className="workspace-dashboard__cell--secondary sift-queue-opportunity-meta">{insight.opportunityName}</div>
                      )}
                    </td>
                    <td className="workspace-dashboard__cell--secondary">{insight.segment || insight.industry || '—'}</td>
                    <td className="workspace-dashboard__cell--secondary">{insight.createdDate.toLocaleDateString()}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <a href={insight.salesforceUrl || `${CRM_BASE_URL}/lightning/r/SIFT_Insight__c/${insight.id}/view`}
                        target="_blank" rel="noopener noreferrer" className="workspace-dashboard__external-link" title="Open in Salesforce">↗</a>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => handleDelete(e, insight.id)} disabled={deleteSift.isPending}
                        className="workspace-dashboard__btn workspace-dashboard__btn--danger workspace-dashboard__btn--sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedInsightId && <SiftDetailModal insightId={selectedInsightId} onClose={() => setSelectedInsightId(null)} />}

      <LeadershipInsightModal isOpen={showModal} onClose={() => setShowModal(false)} agentSlug="work-agent" />
    </div>
  );
}
