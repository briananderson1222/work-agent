import { useState } from 'react';

interface PinDialogProps {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}

export function PinDialog({ onSubmit, onCancel, isLoading, error }: PinDialogProps) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(pin);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'var(--color-bg)',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '320px',
        border: '1px solid var(--color-border)'
      }}>
        <h2 style={{ margin: '0 0 16px', color: 'var(--color-text)' }}>AWS Authentication Required</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter security key PIN"
            disabled={isLoading}
            autoFocus
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              fontSize: '14px',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px'
            }}
          />
          {error && <p style={{ color: 'var(--color-error)', fontSize: '12px', margin: '4px 0' }}>{error}</p>}
          {isLoading && <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0' }}>Touch your security key...</p>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button 
              type="submit" 
              disabled={isLoading || !pin}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading || !pin ? 'not-allowed' : 'pointer',
                opacity: isLoading || !pin ? 0.5 : 1,
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              Authenticate
            </button>
            <button 
              type="button" 
              onClick={onCancel} 
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
