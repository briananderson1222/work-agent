import { transformTool } from '@stallion-ai/sdk';
import type { ISiftProvider } from '../providers';
import type { InsightVM } from '../viewmodels';

const AGENT = 'work-agent';

function mapInsight(raw: any): InsightVM {
  return {
    id: raw.id,
    title: raw.title || raw.name || '',
    summary: raw.summary || '',
    description: raw.description || '',
    category: raw.category || raw.type || '',
    accountId: raw.accountId,
    accountName: raw.accountName || raw.account?.name,
    status: raw.status,
    createdDate: new Date(raw.createdDate || raw.createdAt || Date.now()),
    enrichmentId: raw.enrichmentId,
  };
}

export const siftProvider: ISiftProvider = {
  async listMyInsights(filters?) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_listMyInsights', filters || {}, 'data => data.insights || data || []');
    return (r || []).map(mapInsight);
  },
  async searchInsights(query, filters?) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_search', { queryTerm: query, ...filters }, 'data => data.insights || data || []');
    return (r || []).map(mapInsight);
  },
  async getInsight(id) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_fetchById', { insightId: id }, 'data => data');
    return mapInsight(r);
  },
  async getEnrichment(enrichmentId) {
    return transformTool(AGENT, 'sat-sfdc_sift_assistant_fetchEnrichInsightResponse', { enrichmentId }, 'data => data');
  },
  async createInsight(data) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_create', data, 'data => data');
    return mapInsight(r);
  },
  async updateInsight(id, data) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_update', { id, ...data }, 'data => data');
    return mapInsight(r);
  },
  async deleteInsight(id) {
    await transformTool(AGENT, 'sat-sfdc_sift_insights_delete', { insightId: id }, 'data => data');
  },
  async enrichInsight(data) {
    return transformTool(AGENT, 'sat-sfdc_sift_assistant_enrichInsight', data, 'data => data');
  },
};
