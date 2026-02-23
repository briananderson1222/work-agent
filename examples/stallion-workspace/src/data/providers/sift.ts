import { transformTool } from '@stallion-ai/sdk';
import type { ISiftProvider } from '../providers';
import type { InsightVM } from '../viewmodels';

const AGENT = 'work-agent';

function mapInsight(raw: any): InsightVM {
  return {
    id: raw.id,
    title: raw.title || raw.name || '',
    summary: typeof raw.summary === 'object' ? raw.summary?.summary || '' : raw.summary || '',
    description: raw.description || '',
    category: raw.category || raw.type || '',
    source: raw.source,
    segment: raw.segments?.[0],
    industry: raw.industries?.[0],
    geo: raw.geos?.[0],
    opportunityName: raw.opportunities?.[0]?.name || raw.opportunityName,
    salesforceUrl: raw.salesforceUrl,
    createdDate: new Date(raw.createdAt || raw.createdDate || Date.now()),
    enrichmentId: raw.enrichmentId,
  };
}

export const siftProvider: ISiftProvider = {
  async listMyInsights(filters?) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_listMyInsights', filters || {}, 'data => data?.data?.insights || data?.insights || []');
    return (r || []).map(mapInsight);
  },
  async searchInsights(query, filters?) {
    const r = await transformTool(AGENT, 'sat-sfdc_sift_insights_search', { queryTerm: query, ...filters }, 'data => data?.data?.insights || data?.insights || []');
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
