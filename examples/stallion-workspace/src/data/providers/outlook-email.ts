import { transformTool } from '@stallion-ai/sdk';
import type { IEmailProvider } from '../providers';
import type { EmailVM, EmailDetailVM } from '../viewmodels';

const AGENT = 'work-agent';

function mapEmail(raw: any): EmailVM {
  return {
    id: raw.id,
    subject: raw.subject || '',
    from: { name: raw.from?.name || raw.from?.emailAddress?.name || '', email: raw.from?.address || raw.from?.emailAddress?.address || '' },
    date: new Date(raw.receivedDateTime || raw.date || Date.now()),
    preview: raw.bodyPreview || raw.preview || '',
    isRead: raw.isRead ?? true,
    importance: raw.importance?.toLowerCase() as EmailVM['importance'],
    hasAttachments: raw.hasAttachments ?? false,
  };
}

export const emailProvider: IEmailProvider = {
  async getInbox(options) {
    const r = await transformTool(AGENT, 'sat-outlook_email_inbox', { count: options?.count || 25, filter: options?.filter }, 'data => data.emails || data || []');
    return (r || []).map(mapEmail);
  },
  async searchEmails(query) {
    const r = await transformTool(AGENT, 'sat-outlook_email_search', { query }, 'data => data.emails || data || []');
    return (r || []).map(mapEmail);
  },
  async readEmail(id) {
    const r = await transformTool(AGENT, 'sat-outlook_email_read', { messageId: id }, 'data => data');
    return { ...mapEmail(r), body: r.body?.content || r.body || '', to: (r.toRecipients || []).map((x: any) => ({ name: x.emailAddress?.name || '', email: x.emailAddress?.address || '' })), cc: (r.ccRecipients || []).map((x: any) => ({ name: x.emailAddress?.name || '', email: x.emailAddress?.address || '' })), attachments: (r.attachments || []).map((a: any) => ({ name: a.name, size: a.size || 0, contentType: a.contentType || '' })) };
  },
};