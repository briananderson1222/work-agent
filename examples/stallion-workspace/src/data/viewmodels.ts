/**
 * ViewModels - Data shapes consumed by this workspace's UI
 */

// ============ Calendar ============

export interface CalendarEventVM {
  id: string;
  changeKey?: string;
  subject: string;
  start: Date;
  end: Date;
  location?: string;
  organizer?: string;
  status?: 'tentative' | 'confirmed' | 'cancelled';
  isCancelled?: boolean;
  categories?: string[];
  isAllDay?: boolean;
}

export interface MeetingDetailsVM extends CalendarEventVM {
  body?: string;
  attendees?: AttendeeVM[];
}

export interface AttendeeVM {
  email: string;
  name?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'none';
}

// ============ CRM ============

export interface AccountVM {
  id: string;
  name: string;
  owner?: { id: string; name: string };
  website?: string;
  geo?: string;
  segment?: string;
  healthScore?: number;
  adoptionPhase?: string;
  territory?: string;
  sources?: Array<{ type: 'owner' | 'territory'; label: string }>;
}

export interface OpportunityVM {
  id: string;
  name: string;
  accountId: string;
  amount?: number;
  closeDate: Date;
  stage: string;
  probability: number;
  owner: { id: string; name: string; email: string };
}

export interface TaskVM {
  id: string;
  subject: string;
  status: 'open' | 'completed' | 'deferred';
  dueDate?: Date;
  description?: string;
  priority?: 'high' | 'normal' | 'low';
  activityType?: string;
  relatedTo?: { type: string; id: string; name: string };
}

export interface TerritoryVM {
  id: string;
  name: string;
}

// ============ Email ============

export interface EmailVM {
  id: string;
  subject: string;
  from: { name: string; email: string };
  date: Date;
  preview: string;
  isRead: boolean;
  importance?: 'high' | 'normal' | 'low';
  hasAttachments?: boolean;
}

export interface EmailDetailVM extends EmailVM {
  body: string;
  to: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  attachments?: Array<{ name: string; size: number; contentType: string }>;
}

// ============ Internal (People) ============

export interface PersonVM {
  alias: string;
  name: string;
  title?: string;
  team?: string;
  manager?: string;
  location?: string;
  email?: string;
}

// ============ SIFT / Insights ============

export interface InsightVM {
  id: string;
  title: string;
  summary: string;
  description?: string;
  category: string;
  accountId?: string;
  accountName?: string;
  status?: string;
  createdDate: Date;
  enrichmentId?: string;
}

// ============ Spend ============

export interface AccountSpendVM {
  accountId: string;
  mtdSpend?: number;
  ytdSpend?: number;
  mtdGrowth?: number;
  ytdGrowth?: number;
  lastUpdated?: string;
}

// ============ User ============

export interface UserProfileVM {
  id: string;
  name: string;
  email: string;
  alias?: string;
  role?: string;
  title?: string;
  manager?: string;
}
