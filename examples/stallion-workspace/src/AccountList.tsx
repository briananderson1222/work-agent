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
      <div className="workspace-dashboard__loading account-list-error">
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
          <div className="account-list-source-pills">
            {account._sources?.map((source, idx) => {
              const getSourceClass = () => {
                if (source.type === 'owner') return 'account-list-source-pill--owner';
                if (source.type === 'territory') return 'account-list-source-pill--territory';
                return 'account-list-source-pill--owner';
              };
              
              return (
                <span key={idx} className={`account-list-source-pill ${getSourceClass()}`}>
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
                className="account-list-website-link"
              >
                {account.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
          
          {/* Metadata Pills */}
          <div className="account-list-metadata-pills">
            {account.geo_Text__c && (
              <span className="account-list-metadata-pill account-list-metadata-pill--geo">
                {account.geo_Text__c}
              </span>
            )}
            {account.awsci_customer?.customerRevenue?.tShirtSize && (
              <span className="account-list-metadata-pill account-list-metadata-pill--size">
                {account.awsci_customer.customerRevenue.tShirtSize}
              </span>
            )}
          </div>
          
          <div className="account-list-sfdc-link">
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
        <div className="account-list-show-more-section">
          <button
            onClick={onShowMore}
            className="account-list-show-more-btn"
          >
            Show More ({accounts.length - displayLimit} remaining)
          </button>
        </div>
      )}
      {displayLimit > 50 && accounts.length <= displayLimit && (
        <div className="account-list-show-more-section">
          <button
            onClick={onShowLess}
            className="account-list-show-less-btn"
          >
            Show Less
          </button>
        </div>
      )}
    </>
  );
}