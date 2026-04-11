import React from 'react';
import type { DiscoveredServer } from '../core/types';

function ScanSpinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: '2px solid var(--border-primary, #333)',
        borderTopColor: 'var(--accent-primary, #3b82f6)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--accent-primary, #3b82f6)',
  color: 'white',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: '1px solid var(--border-primary, #333)',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--text-primary, #e5e5e5)',
};

interface ConnectionManagerDiscoverPanelProps {
  scanning: boolean;
  discovered: DiscoveredServer[];
  existingUrls: Set<string>;
  onRescan: () => void;
  onAdd: (server: DiscoveredServer) => void;
  onBack: () => void;
}

export function ConnectionManagerDiscoverPanel({
  scanning,
  discovered,
  existingUrls,
  onRescan,
  onAdd,
  onBack,
}: ConnectionManagerDiscoverPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {scanning ? (
          <>
            <span
              style={{ fontSize: 13, color: 'var(--text-secondary, #999)' }}
            >
              Scanning local network…
            </span>
            <ScanSpinner />
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-secondary, #999)' }}>
            {discovered.length === 0
              ? 'No servers found on this network.'
              : `Found ${discovered.length} server${discovered.length !== 1 ? 's' : ''}.`}
          </span>
        )}
        <button
          type="button"
          onClick={onRescan}
          disabled={scanning}
          style={{ ...secondaryBtnStyle, marginLeft: 'auto', fontSize: 16 }}
          title="Scan again"
        >
          ↻
        </button>
      </div>

      {/* Results */}
      {discovered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {discovered.map((server) => {
            const alreadyAdded = existingUrls.has(server.url);
            return (
              <div
                key={server.url}
                style={{
                  background: 'var(--bg-primary, #0a0a0a)',
                  border: '1px solid var(--border-primary, #333)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {server.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary, #999)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {server.url}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted, #666)',
                    flexShrink: 0,
                  }}
                >
                  {server.latency}ms
                </span>
                {alreadyAdded ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary, #999)',
                      flexShrink: 0,
                    }}
                  >
                    Added
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(server)}
                    style={{
                      ...primaryBtnStyle,
                      padding: '6px 14px',
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Scanning placeholder rows */}
      {scanning && discovered.length === 0 && (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-muted, #666)',
          }}
        >
          Probing 192.168.x.1–254 on port 3141…
        </div>
      )}

      <button type="button" onClick={onBack} style={secondaryBtnStyle}>
        ← Back
      </button>
    </div>
  );
}
