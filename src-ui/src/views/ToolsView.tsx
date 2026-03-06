import { useState, useEffect, useCallback } from 'react';
import { LoadingState } from '@stallion-ai/sdk';
import { useApiBase } from '../contexts/ApiBaseContext';
import './PluginManagementView.css';
import './page-layout.css';

interface ToolDef {
  id: string;
  displayName?: string;
  description?: string;
  kind?: string;
  transport?: string;
  source?: string;
  usedBy?: string[];
}

interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  installed?: boolean;
}

/* ── Tool Registry Modal ── */
function ToolRegistryModal({ apiBase, onClose }: { apiBase: string; onClose: () => void }) {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/registry/tools`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data.success ? data.data || [] : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAction = async (item: RegistryItem, action: 'install' | 'uninstall') => {
    setActionLoading(item.id);
    setMessage(null);
    try {
      const res = action === 'install'
        ? await fetch(`${apiBase}/api/registry/tools/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
        : await fetch(`${apiBase}/api/registry/tools/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || `${action === 'install' ? 'Installed' : 'Removed'} ${item.displayName || item.id}` });
        fetchItems();
      } else {
        setMessage({ type: 'error', text: data.error || `${action} failed` });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
    finally { setActionLoading(null); }
  };

  const filtered = items.filter(item => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (item.displayName || item.id).toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
  });

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div className="plugins__modal" onClick={e => e.stopPropagation()}>
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Tool Registry</h3>
          <button className="plugins__modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="plugins__modal-body">
          {message && <div className={`plugins__modal-message plugins__message--${message.type}`}>{message.text}</div>}
          {loading ? (
            <LoadingState message="Loading registry..." />
          ) : items.length === 0 ? (
            <div className="plugins__empty">No tool registry provider configured.</div>
          ) : (
            <>
              <input className="plugins__filter-input" type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter tools..." autoFocus />
              <div className="plugins__registry-list">
                {filtered.length === 0 ? (
                  <div className="plugins__empty">No tools match "{filter}"</div>
                ) : filtered.map(item => (
                  <div key={item.id} className="plugins__registry-item">
                    <div className="plugins__registry-info">
                      <div className="plugins__registry-name">
                        {item.displayName || item.id}
                        {item.version && <span className="plugins__card-version">v{item.version}</span>}
                      </div>
                      {item.description && <div className="plugins__registry-desc">{item.description}</div>}
                    </div>
                    <button
                      className={`plugins__btn ${item.installed ? 'plugins__btn--uninstall' : 'plugins__btn--install'}`}
                      onClick={() => handleAction(item, item.installed ? 'uninstall' : 'install')}
                      disabled={actionLoading === item.id}
                    >
                      {actionLoading === item.id ? '...' : (item.installed ? 'Remove' : 'Install')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Tools View ── */
export function ToolsView() {
  const { apiBase } = useApiBase();
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showRegistry, setShowRegistry] = useState(false);
  const [hasRegistry, setHasRegistry] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ id: '', command: '', args: '', displayName: '', description: '' });
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/tools`);
      const data = await res.json();
      setTools(data.success ? data.data || [] : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => {
    fetch(`${apiBase}/api/registry/tools`)
      .then(r => r.json())
      .then(d => setHasRegistry(d.success && d.data?.length > 0))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleAdd = async () => {
    if (!addForm.id.trim() || !addForm.command.trim()) return;
    setAdding(true);
    setMessage(null);
    try {
      const def: any = {
        id: addForm.id.trim(),
        kind: 'mcp',
        transport: 'stdio',
        command: addForm.command.trim(),
      };
      if (addForm.args.trim()) def.args = addForm.args.split(/\s+/).filter(Boolean);
      if (addForm.displayName.trim()) def.displayName = addForm.displayName.trim();
      if (addForm.description.trim()) def.description = addForm.description.trim();
      const res = await fetch(`${apiBase}/tools`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(def),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Added ${def.displayName || def.id}` });
        setAddForm({ id: '', command: '', args: '', displayName: '', description: '' });
        setShowAdd(false);
        fetchTools();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add tool' });
      }
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
    finally { setAdding(false); }
  };

  return (
    <div className="plugins page">
      <div className="page__header">
        <div className="page__header-text">
          <div className="page__label">sys / manage / tools</div>
          <h1 className="page__title">Tools</h1>
          <p className="page__subtitle">Installed tool configurations</p>
        </div>
        <div className="page__actions">
          {hasRegistry && (
            <button className="plugins__section-action" onClick={() => setShowRegistry(true)}>Browse Registry</button>
          )}
          <button className="page__btn-primary" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? 'Cancel' : 'Add Tool'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`plugins__modal-message plugins__message--${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
      )}

      {showAdd && (
        <div className="plugins__install" style={{ flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="plugins__install-input" value={addForm.id} onChange={e => setAddForm(f => ({ ...f, id: e.target.value }))} placeholder="tool-id (e.g. my-mcp-server)" style={{ flex: 1 }} />
            <input className="plugins__install-input" value={addForm.displayName} onChange={e => setAddForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Display name (optional)" style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="plugins__install-input" value={addForm.command} onChange={e => setAddForm(f => ({ ...f, command: e.target.value }))} placeholder="Command (e.g. npx, uvx, node)" style={{ flex: 1 }} />
            <input className="plugins__install-input" value={addForm.args} onChange={e => setAddForm(f => ({ ...f, args: e.target.value }))} placeholder="Args (space-separated)" style={{ flex: 2 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="plugins__install-input" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" style={{ flex: 1 }} />
            <button className="plugins__install-btn" onClick={handleAdd} disabled={adding || !addForm.id.trim() || !addForm.command.trim()}>
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      <div className="plugins__section">
        <div className="plugins__section-header">
          <h3 className="plugins__section-title">Installed Tools</h3>
          <span className="plugins__section-count">{tools.length} active</span>
        </div>
        {loading ? (
          <LoadingState message="Loading tools..." />
        ) : tools.length === 0 ? (
          <div className="plugins__empty">No tools configured.</div>
        ) : (
          <>
            <input className="plugins__filter-input" type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter tools..." />
            <table className="plugins__tools-table">
              <thead>
                <tr>
                  <th className="plugins__tools-th">Name</th>
                  <th className="plugins__tools-th">Type</th>
                  <th className="plugins__tools-th">Source</th>
                  <th className="plugins__tools-th">Agents</th>
                  <th className="plugins__tools-th">Description</th>
                </tr>
              </thead>
              <tbody>
                {tools
                  .filter(t => {
                    if (!filter) return true;
                    const q = filter.toLowerCase();
                    const name = (t.displayName || t.id).toLowerCase();
                    return name.includes(q) || t.description?.toLowerCase().includes(q) || t.kind?.toLowerCase().includes(q) || t.source?.toLowerCase().includes(q) || t.usedBy?.some(a => a.toLowerCase().includes(q));
                  })
                  .map(t => (
                    <tr key={t.id} className="plugins__tools-tr">
                      <td className="plugins__tools-td"><span className="plugins__tools-name">{t.displayName || t.id}</span></td>
                      <td className="plugins__tools-td"><span className="plugins__tools-kind">{t.transport || t.kind || 'mcp'}</span></td>
                      <td className="plugins__tools-td"><span className="plugins__tools-desc">{t.source || t.id}</span></td>
                      <td className="plugins__tools-td">
                        {t.usedBy?.length ? t.usedBy.map(a => (
                          <span key={a} className="plugins__cap plugins__cap--agent">{a}</span>
                        )) : <span className="plugins__tools-desc">-</span>}
                      </td>
                      <td className="plugins__tools-td"><span className="plugins__tools-desc">{t.description || '-'}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {showRegistry && <ToolRegistryModal apiBase={apiBase} onClose={() => { setShowRegistry(false); fetchTools(); }} />}
    </div>
  );
}
