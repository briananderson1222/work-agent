import { useState } from 'react';
import { Button, invokeAgent, useToast } from '@stallion-ai/sdk';

interface Account {
  id: string;
  name: string;
}

interface Opportunity {
  id: string;
  name: string;
  stageName: string;
}

interface OpportunityModalProps {
  showCreateOppModal: boolean;
  showLogActivityModal: boolean;
  showAiPreview: boolean;
  selectedAccount: Account | null;
  selectedOpportunity: Opportunity | null;
  oppFormData: {
    name: string;
    stageName: string;
    closeDate: string;
    amount: string;
    probability: string;
  };
  activityFormData: {
    subject: string;
    activityDate: string;
    description: string;
    saActivity: string;
  };
  aiGeneratedText: string;
  isGeneratingAi: boolean;
  loading: boolean;
  onCloseCreateOpp: () => void;
  onCloseLogActivity: () => void;
  onCloseAiPreview: () => void;
  onOppFormChange: (data: any) => void;
  onActivityFormChange: (data: any) => void;
  onCreateOpportunity: () => void;
  onLogActivity: () => void;
  onGenerateAi: () => void;
  onApplyAi: () => void;
  onSetAiText: (text: string) => void;
  onAccountClick: () => void;
}

export function OpportunityModal({
  showCreateOppModal,
  showLogActivityModal,
  showAiPreview,
  selectedAccount,
  selectedOpportunity,
  oppFormData,
  activityFormData,
  aiGeneratedText,
  isGeneratingAi,
  loading,
  onCloseCreateOpp,
  onCloseLogActivity,
  onCloseAiPreview,
  onOppFormChange,
  onActivityFormChange,
  onCreateOpportunity,
  onLogActivity,
  onGenerateAi,
  onApplyAi,
  onSetAiText,
  onAccountClick
}: OpportunityModalProps) {
  const { showToast } = useToast();

  return (
    <>
      {/* Create Opportunity Modal */}
      {showCreateOppModal && (
        <div className="crm-modal-overlay" onClick={onCloseCreateOpp}>
          <div className="crm-modal-content crm-modal-content--sm" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3 className="crm-modal-title">Create Opportunity</h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div className="crm-form-group">
                <div className="crm-form-field">
                  <label className="crm-form-label crm-form-label--required">Name</label>
                  <input
                    type="text"
                    value={oppFormData.name}
                    onChange={(e) => onOppFormChange({...oppFormData, name: e.target.value})}
                    className="crm-form-input"
                  />
                </div>
                <div className="crm-form-field">
                  <label className="crm-form-label crm-form-label--required">Stage</label>
                  <select
                    value={oppFormData.stageName}
                    onChange={(e) => onOppFormChange({...oppFormData, stageName: e.target.value})}
                    className="crm-form-input"
                  >
                    <option>Prospecting</option>
                    <option>Qualification</option>
                    <option>Proposal</option>
                    <option>Negotiation</option>
                    <option>Closed Won</option>
                    <option>Closed Lost</option>
                  </select>
                </div>
                <div className="crm-form-field">
                  <label className="crm-form-label crm-form-label--required">Close Date</label>
                  <input
                    type="date"
                    value={oppFormData.closeDate}
                    onChange={(e) => onOppFormChange({...oppFormData, closeDate: e.target.value})}
                    className="crm-form-input"
                  />
                </div>
                <div className="crm-form-field">
                  <label className="crm-form-label">Amount</label>
                  <input
                    type="number"
                    value={oppFormData.amount}
                    onChange={(e) => onOppFormChange({...oppFormData, amount: e.target.value})}
                    className="crm-form-input"
                  />
                </div>
              </div>
            </div>
            <div className="crm-form-actions">
              <Button variant="ghost" onClick={onCloseCreateOpp}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onCreateOpportunity}
                disabled={!oppFormData.name || !oppFormData.closeDate}
                loading={loading}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Log SA Activity Modal */}
      {showLogActivityModal && selectedOpportunity && (
        <div className="crm-modal-overlay" onClick={onCloseLogActivity}>
          <div className="crm-modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="crm-modal-header">
              <h3 className="crm-modal-title">
                Log SA Activity
              </h3>
            </div>

            {/* Context Section */}
            <div className="crm-detail-section">
              <div className="crm-context-section">
                <div className="crm-context-row">
                  <span className="crm-context-label">Account:</span>
                  <button
                    onClick={onAccountClick}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      fontSize: '0.875rem'
                    }}
                  >
                    {selectedAccount?.name}
                  </button>
                </div>
                <div className="crm-context-row">
                  <span className="crm-context-label">Opportunity:</span>
                  <span className="crm-context-value">{selectedOpportunity.name}</span>
                </div>
                <div className="crm-context-row">
                  <span className="crm-context-label">Stage:</span>
                  <span className="crm-context-value">{selectedOpportunity.stageName}</span>
                </div>
              </div>
            </div>

            {/* Form */}
            <div style={{ padding: '1.5rem' }}>
              <div className="crm-form-group">
                <div className="crm-form-field">
                  <label className="crm-form-label crm-form-label--required">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={activityFormData.subject}
                    onChange={(e) => onActivityFormChange({...activityFormData, subject: e.target.value})}
                    placeholder="Brief summary of the activity"
                    className="crm-form-input"
                  />
                </div>

                <div className="crm-form-field">
                  <label className="crm-form-label crm-form-label--required">
                    SA Activity
                  </label>
                  <select
                    value={activityFormData.saActivity}
                    onChange={(e) => onActivityFormChange({...activityFormData, saActivity: e.target.value})}
                    className="crm-form-input"
                  >
                    <option value="">Select activity type...</option>
                    <option>Architecture Review [Architecture]</option>
                    <option>Demo [Architecture]</option>
                    <option>Prototype/PoC/Pilot [Architecture]</option>
                    <option>Well Architected [Architecture]</option>
                    <option>Meeting / Office Hours [Management]</option>
                    <option>Account Planning [Management]</option>
                    <option>Immersion Day [Workshops]</option>
                    <option>GameDay [Workshops]</option>
                  </select>
                </div>

                <div className="crm-form-field">
                  <label className="crm-form-label crm-form-label--required">
                    Activity Date
                  </label>
                  <input
                    type="date"
                    value={activityFormData.activityDate}
                    onChange={(e) => onActivityFormChange({...activityFormData, activityDate: e.target.value})}
                    className="crm-form-input"
                  />
                </div>

                <div className="crm-form-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="crm-form-label">
                      Description
                    </label>
                    <button
                      onClick={onGenerateAi}
                      disabled={isGeneratingAi || !activityFormData.subject}
                      className="crm-ai-assist-btn"
                    >
                      {isGeneratingAi ? '✨ Generating...' : '✨ AI Assist'}
                    </button>
                  </div>
                  <textarea
                    value={activityFormData.description}
                    onChange={(e) => onActivityFormChange({...activityFormData, description: e.target.value})}
                    rows={4}
                    placeholder="Detailed description of the activity and outcomes"
                    className="crm-form-textarea"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="crm-form-actions">
              <Button variant="ghost" onClick={onCloseLogActivity}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onLogActivity}
                disabled={!activityFormData.subject || !activityFormData.saActivity}
                loading={loading}
              >
                Log Activity
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Preview Modal */}
      {showAiPreview && (
        <div className="crm-modal-overlay" onClick={onCloseAiPreview}>
          <div className="crm-modal-content crm-modal-content--sm" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3 className="crm-modal-title crm-modal-title--sm">
                AI Generated Description
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <textarea
                value={aiGeneratedText}
                onChange={(e) => onSetAiText(e.target.value)}
                rows={6}
                className="crm-form-textarea"
              />
              <p className="crm-form-help-text">
                Review and edit the generated text before applying
              </p>
            </div>
            <div className="crm-form-actions">
              <Button variant="ghost" onClick={onCloseAiPreview}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onApplyAi}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}