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

// ============ User ============

export interface UserProfileVM {
  id: string;
  name: string;
  email: string;
  alias?: string;
  role?: string;
}
