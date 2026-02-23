import { CRM_BASE_URL } from './constants';

interface Account {
  id: string;
  name: string;
  owner?: { name: string };
  website?: string;
  geo_Text__c?: string;
  awsci_customer?: {
    customerRevenue?: {
      tShirtSize?: string;
    };
  };
  _sources?: Array<{
    type: 'owner' | 'territory';
    label: string;
  }>;
}

interface AccountListProps {
  accounts: Account[];
  selectedAccount: Account | null;
  loading: boolean;
  searchError: string | null;
  displayLimit: number;
  onAccountSelect: (account: Account) => void;
  onShowMore: () => void;
  onShowLess: () => void;
}

export function AccountList({
  accounts,
  selectedAccount,
  loading,
  searchError,
  displayLimit,
  onAccountSelect,
  onShowMore,
  onShowLess
}: AccountListProps) {
  if (loading && accounts.length === 0) {
    return <div className="workspace-dashboard__loading">Loading...</div>;
  }

  if (searchError) {
    return (
      <div className="workspace-dashboard__loading" style={{ color: 'var(--color-error)', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        {searchError}
      </div>
    );
  }

  if (accounts.length === 0 && !loading && !searchError) {
    return (
      <div className="workspace-dashboard__empty">
        <div>
          <div className="workspace-dashboard__empty-title">No Accounts</div>
          <div className="workspace-dashboard__empty-subtitle">
            Search for accounts by owner name or territory
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {accounts.slice(0, displayLimit).map((account) => (
        <div
          key={account.id}
          data-account-id={account.id}
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).closest('a')) {
              return;
            }
            onAccountSelect(account);
          }}
          className={`workspace-dashboard__list-item ${
            selectedAccount?.id === account.id ? 'is-active' : ''
          }`}
        >
          <div className="workspace-dashboard__list-item-title">
            {account.name}
          </div>
          
          {/* Owner and Territory Pills */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {account._sources?.map((source, idx) => {
              const getSourceColor = () => {
                if (source.type === 'owner') return 'var(--color-primary)';
                if (source.type === 'territory') return 'var(--color-success)';
                return 'var(--color-primary)';
              };
              
              return (
                <span key={idx} style={{
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '12px',
                  background: getSourceColor(),
                  color: 'white',
                  fontWeight: 500
                }}>
                  {source.label}
                </span>
              );
            })}
          </div>
          
          <div className="workspace-dashboard__list-item-meta">
            {account.website && (
              <a
                href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-primary)',
                  textDecoration: 'none'
                }}
              >
                {account.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
          
          {/* Metadata Pills */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {account.geo_Text__c && (
              <span style={{
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: '12px',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-text-secondary)',
                fontWeight: 500
              }}>
                {account.geo_Text__c}
              </span>
            )}
            {account.awsci_customer?.customerRevenue?.tShirtSize && (
              <span style={{
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: '12px',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--text-tertiary)',
                fontWeight: 500
              }}>
                {account.awsci_customer.customerRevenue.tShirtSize}
              </span>
            )}
          </div>
          
          <div style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem'
          }}>
            <a
              href={`${CRM_BASE_URL}/lightning/r/Account/${account.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-primary)',
                fontSize: '1rem',
                textDecoration: 'none'
              }}
              title="Open in Salesforce"
            >
              ↗
            </a>
          </div>
        </div>
      ))}
      
      {/* Show More/Less Button */}
      {accounts.length > displayLimit && (
        <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={onShowMore}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Show More ({accounts.length - displayLimit} remaining)
          </button>
        </div>
      )}
      {displayLimit > 50 && accounts.length <= displayLimit && (
        <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={onShowLess}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-secondary)',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Show Less
          </button>
        </div>
      )}
    </>
  );
}