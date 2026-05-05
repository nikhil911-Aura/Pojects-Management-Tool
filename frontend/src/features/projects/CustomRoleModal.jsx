import { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '../../store/hooks';
import { io } from 'socket.io-client';
import api from '../../services/api';

/**
 * Modal for configuring granular permissions for a named project role.
 *
 * Props:
 *   currentPermissions  — existing permissions JSON (or null)
 *   memberName          — display name (optional)
 *   showNameField       — show "Role name" input
 *   roleName            — initial name
 *   projectId           — if provided, fetches columns for that project directly
 *   onSave(permissions, roleName)
 *   onCancel()
 */
export default function CustomRoleModal({ currentPermissions, memberName, showNameField, roleName: initialName, projectId: fixedProjectId, onSave, onCancel }) {
  const { projects } = useAppSelector((state) => state.project);

  const [permissionKeys, setPermissionKeys] = useState([]);
  const [customColumns, setCustomColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState({});
  const [columnPerms, setColumnPerms] = useState(() => {
    // Pre-populate from saved permissions so the values are correct even before
    // the column fetch resolves. This prevents the "all green" flash on re-open.
    const saved = currentPermissions?.columns;
    return (saved && typeof saved === 'object') ? { ...saved } : {};
  });
  const [saving, setSaving] = useState(false);
  const [roleName, setRoleName] = useState(initialName || '');
  const [error, setError] = useState('');

  // When no fixed projectId, let the admin pick a project to load its columns
  const [selectedProjectId, setSelectedProjectId] = useState(fixedProjectId || '');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const pickerRef = useRef(null);
  const activeProjectId = fixedProjectId || selectedProjectId;

  // Fetch permission keys once on mount
  useEffect(() => {
    api.get('/api/v1/projects/permission-keys')
      .then((res) => {
        const keys = res.data.data || [];
        setPermissionKeys(keys);
        const initial = {};
        keys.forEach((k) => { initial[k.key] = currentPermissions?.[k.key] ?? false; });
        setPerms(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentPermissions]);

  // Fetch custom columns whenever activeProjectId changes.
  // Read saved column access from currentPermissions.columns — if a column
  // has an explicit false, respect it. Only default to true for genuinely
  // new columns (not present in the saved map at all AND the map exists).
  useEffect(() => {
    if (!activeProjectId) { setCustomColumns([]); return; }
    api.get(`/api/v1/custom-fields/project/${activeProjectId}`)
      .then((res) => {
        const columns = res.data.data || [];
        setCustomColumns(columns);
        const savedCols = currentPermissions?.columns;
        const hasSavedCols = savedCols && typeof savedCols === 'object' && Object.keys(savedCols).length > 0;
        const colPermsInit = {};
        columns.forEach((c) => {
          if (hasSavedCols) {
            // Existing role: use saved value, default NEW columns (not in map) to true
            colPermsInit[c.id] = savedCols[c.id] !== undefined ? savedCols[c.id] : true;
          } else {
            // Brand new role with no column config yet: all default true
            colPermsInit[c.id] = true;
          }
        });
        setColumnPerms(colPermsInit);
      })
      .catch(() => { setCustomColumns([]); setColumnPerms({}); });
  }, [activeProjectId, currentPermissions]);

  // Live socket updates for custom columns
  useEffect(() => {
    if (!activeProjectId) return;
    const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;
    const socket = io(SOCKET_URL, {
      withCredentials: true, transports: ['websocket'], reconnection: false,
    });
    socket.on('connect', () => { socket.emit('join_project', activeProjectId); });

    socket.on('instant_change', (data) => {
      if (!data?.event) return;
      if (data.event === 'custom_field_added' && data.field) {
        setCustomColumns(prev => {
          if (prev.some(c => c.id === data.field.id)) return prev;
          return [...prev, data.field];
        });
        setColumnPerms(prev => ({ ...prev, [data.field.id]: true }));
      }
      if (data.event === 'custom_field_deleted' && data.fieldId) {
        setCustomColumns(prev => prev.filter(c => c.id !== data.fieldId));
        setColumnPerms(prev => { const next = { ...prev }; delete next[data.fieldId]; return next; });
      }
      if (data.event === 'custom_field_replaced' && data.tempId && data.field) {
        setCustomColumns(prev => prev.map(c => c.id === data.tempId ? data.field : c));
        setColumnPerms(prev => {
          const next = { ...prev };
          if (next[data.tempId] !== undefined) { next[data.field.id] = next[data.tempId]; delete next[data.tempId]; }
          return next;
        });
      }
    });

    return () => { socket.disconnect(); };
  }, [activeProjectId]);

  const toggle = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }));
  const toggleColumn = (fieldId) => setColumnPerms((p) => ({ ...p, [fieldId]: !p[fieldId] }));

  const enabledPermCount = Object.values(perms).filter(Boolean).length;
  const enabledColCount = Object.values(columnPerms).filter(Boolean).length;
  const totalEnabled = enabledPermCount + enabledColCount;
  const totalKeys = permissionKeys.length + customColumns.length;

  const selectAll = () => {
    const next = {}; permissionKeys.forEach((k) => { next[k.key] = true; }); setPerms(next);
    const colNext = {}; customColumns.forEach((c) => { colNext[c.id] = true; }); setColumnPerms(colNext);
  };
  const deselectAll = () => {
    const next = {}; permissionKeys.forEach((k) => { next[k.key] = false; }); setPerms(next);
    const colNext = {}; customColumns.forEach((c) => { colNext[c.id] = false; }); setColumnPerms(colNext);
  };

  const handleSave = async () => {
    setError('');
    if (showNameField && !roleName.trim()) {
      setError('Role name is required');
      return;
    }
    setSaving(true);
    const finalPerms = { ...perms, columns: columnPerms };
    try {
      await onSave(finalPerms, roleName.trim());
    } catch (err) {
      setError(err?.message || err?.response?.data?.message || 'Failed to save role');
      setSaving(false);
    }
  };

  const groups = {};
  permissionKeys.forEach((k) => { if (!groups[k.group]) groups[k.group] = []; groups[k.group].push(k); });

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-[var(--asana-surface)] rounded-xl shadow-2xl w-full max-w-lg border border-[var(--asana-border)] animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--asana-border)]">
          <div>
            <h2 className="text-base font-bold text-[var(--asana-text-primary)]">
              {showNameField ? 'Create Custom Role' : 'Edit Permissions'}
            </h2>
            {memberName && (
              <p className="text-xs text-[var(--asana-text-secondary)] mt-0.5">
                for <span className="font-semibold">{memberName}</span>
              </p>
            )}
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-[var(--asana-text-secondary)] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-asana-blue" />
            </div>
          ) : (
            <>
              {/* Role name */}
              {showNameField && (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-1.5">Role name</label>
                  <input
                    type="text" value={roleName}
                    onChange={(e) => { setRoleName(e.target.value); if (error) setError(''); }}
                    placeholder="e.g. QA Tester, Client Reviewer" autoFocus
                    className={`w-full px-3 py-2 text-sm bg-[var(--asana-bg)] border rounded-lg text-[var(--asana-text-primary)] outline-none focus:ring-1 ${
                      error
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border-[var(--asana-border)] focus:border-asana-blue focus:ring-asana-blue'
                    }`}
                  />
                  {error && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {error}
                    </p>
                  )}
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-[var(--asana-text-secondary)]">
                  {totalEnabled} of {totalKeys} permissions enabled
                </span>
                <div className="flex items-center space-x-2">
                  <button onClick={selectAll} className="text-[11px] font-semibold text-asana-blue hover:underline">Select all</button>
                  <span className="text-[var(--asana-text-secondary)]">·</span>
                  <button onClick={deselectAll} className="text-[11px] font-semibold text-[var(--asana-text-secondary)] hover:underline">Deselect all</button>
                </div>
              </div>

              {/* Permission groups */}
              {Object.entries(groups).map(([groupName, keys]) => (
                <div key={groupName} className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-2">{groupName}</h3>
                  <div className="space-y-1">
                    {keys.map((k) => (
                      <label key={k.key} className="flex items-center px-3 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors group/perm">
                        <div className="relative flex-shrink-0 mr-3">
                          <input type="checkbox" checked={!!perms[k.key]} onChange={() => toggle(k.key)} className="sr-only" />
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                            perms[k.key] ? 'bg-asana-blue border-asana-blue' : 'border-gray-300 dark:border-gray-600 group-hover/perm:border-asana-blue/50'
                          }`}>
                            {perms[k.key] && (
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-[var(--asana-text-primary)]">{k.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Custom Columns section */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--asana-text-secondary)]">Custom Columns</h3>
                  {customColumns.length > 0 && (
                    <span className="text-[10px] text-[var(--asana-text-muted)]">
                      {enabledColCount}/{customColumns.length} visible
                      {activeProjectId && (
                        <span className="ml-1.5 inline-flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1" />
                          Live
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Project selector — custom styled dropdown */}
                {!fixedProjectId && (
                  <div className="mb-3 relative" ref={pickerRef}>
                    <button
                      onClick={() => { setShowProjectPicker(!showProjectPicker); setProjectSearch(''); }}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-lg text-[var(--asana-text-primary)] hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                    >
                      {selectedProjectId ? (
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-4 h-4 rounded flex-shrink-0"
                            style={{ backgroundColor: (projects || []).find(p => p.id === selectedProjectId)?.color || '#4573D2' }} />
                          <span className="truncate">{(projects || []).find(p => p.id === selectedProjectId)?.name || 'Project'}</span>
                        </div>
                      ) : (
                        <span className="text-[var(--asana-text-muted)]">Select a project...</span>
                      )}
                      <svg className={`w-3.5 h-3.5 text-[var(--asana-text-secondary)] flex-shrink-0 ml-2 transition-transform ${showProjectPicker ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showProjectPicker && (
                      <>
                        <div className="fixed inset-0 z-[10]" onClick={() => setShowProjectPicker(false)} />
                        <div className="absolute bottom-full left-0 right-0 mb-1 z-[20] bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                          {/* Search */}
                          <div className="p-2 border-b border-[var(--asana-border)]">
                            <input
                              type="text" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
                              placeholder="Search projects..." autoFocus
                              className="w-full px-2.5 py-1.5 text-xs bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-md text-[var(--asana-text-primary)] outline-none focus:border-asana-blue placeholder-[var(--asana-text-muted)]"
                            />
                          </div>
                          {/* Project list */}
                          <div className="max-h-48 overflow-y-auto py-1">
                            {(projects || [])
                              .filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()))
                              .map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => { setSelectedProjectId(p.id); setShowProjectPicker(false); }}
                                  className={`w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                                    p.id === selectedProjectId ? 'bg-asana-blue/5' : ''
                                  }`}
                                >
                                  <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold mr-2.5 flex-shrink-0"
                                    style={{ backgroundColor: p.color || '#4573D2' }}>
                                    {p.name?.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-sm text-[var(--asana-text-primary)] truncate">{p.name}</span>
                                  {p.id === selectedProjectId && (
                                    <svg className="w-4 h-4 text-asana-blue ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            {(projects || []).filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())).length === 0 && (
                              <p className="text-xs text-[var(--asana-text-muted)] text-center py-3">No projects found</p>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!activeProjectId && !showProjectPicker && (
                  <p className="text-xs text-[var(--asana-text-muted)] italic px-3 py-2">
                    Select a project above to configure column access.
                  </p>
                )}

                {activeProjectId && customColumns.length === 0 && (
                  <p className="text-xs text-[var(--asana-text-muted)] italic px-3 py-2">
                    This project has no custom columns yet.
                  </p>
                )}

                {customColumns.length > 0 && (
                  <div className="space-y-1">
                    {customColumns.map((col) => (
                      <label key={col.id} className="flex items-center px-3 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors group/perm">
                        <div className="relative flex-shrink-0 mr-3">
                          <input type="checkbox" checked={!!columnPerms[col.id]} onChange={() => toggleColumn(col.id)} className="sr-only" />
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                            columnPerms[col.id] ? 'bg-asana-blue border-asana-blue' : 'border-gray-300 dark:border-gray-600 group-hover/perm:border-asana-blue/50'
                          }`}>
                            {columnPerms[col.id] && (
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-[var(--asana-text-primary)]">{col.name}</span>
                          <span className="text-[10px] text-[var(--asana-text-muted)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {col.type?.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-[var(--asana-border)] space-x-2">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[var(--asana-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            disabled={saving || loading || (showNameField && !roleName.trim())}
            className="px-4 py-2 text-sm font-medium bg-asana-blue text-white rounded-md hover:brightness-110 disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : showNameField ? 'Create Role' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
