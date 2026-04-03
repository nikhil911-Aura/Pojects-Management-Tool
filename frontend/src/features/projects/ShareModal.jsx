import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProject, addProjectMember, updateProjectMemberRole, removeProjectMember } from '../../store/slices/projectSlice';
import { useRole } from '../../hooks/useRole';

const PROJECT_ROLE_LABELS = {
  EDITOR:    { label: 'Editor',    desc: 'Can edit tasks, sections, and comments' },
  COMMENTER: { label: 'Commenter', desc: 'Can view and comment, but not edit' },
  VIEWER:    { label: 'Viewer',    desc: 'Read-only access' },
};

const PROJECT_ROLE_STYLE = {
  EDITOR:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  COMMENTER: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  VIEWER:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

/* Custom role dropdown — no native <select> ugliness */
function RoleDropdown({ value, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropdownHeight = 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < dropdownHeight) {
        setPos({ top: rect.top - dropdownHeight - 4, left: rect.right - 208 });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.right - 208 });
      }
    }
    setOpen(!open);
  };

  const current = PROJECT_ROLE_LABELS[value] || PROJECT_ROLE_LABELS.EDITOR;
  const style = PROJECT_ROLE_STYLE[value] || PROJECT_ROLE_STYLE.EDITOR;

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className={`flex items-center space-x-1.5 text-xs font-bold rounded-lg px-2.5 py-1.5 transition-colors hover:ring-1 hover:ring-[var(--asana-border)] ${style} ${compact ? '' : 'min-w-[100px]'}`}>
        <span>{current.label}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div ref={ref} className="fixed z-[200] w-52 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl py-1 animate-fade-in"
          style={{ top: pos.top, left: Math.max(8, pos.left) }}>
          {Object.entries(PROJECT_ROLE_LABELS).map(([key, { label, desc }]) => {
            const isActive = value === key;
            return (
              <button key={key} onClick={() => { onChange(key); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isActive ? 'bg-asana-blue/5' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`text-xs font-bold inline-block px-2 py-0.5 rounded ${PROJECT_ROLE_STYLE[key]}`}>{label}</span>
                    <p className="text-[10px] text-[var(--asana-text-secondary)] mt-0.5 ml-0.5">{desc}</p>
                  </div>
                  {isActive && (
                    <svg className="w-4 h-4 text-asana-blue flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ShareModal({ projectId, onClose, emitInstant }) {
  const dispatch = useAppDispatch();
  const { currentProject } = useAppSelector(state => state.project);
  const { currentWorkspace } = useAppSelector(state => state.workspace);
  const { user: currentUser } = useAppSelector(state => state.auth);
  const { isWorkspaceAdmin } = useRole();

  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('EDITOR');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const projectMembers = currentProject?.members || [];
  const projectMemberIds = new Set(projectMembers.map(m => m.userId));

  // Workspace members not yet in the project
  const availableMembers = (currentWorkspace?.members || []).filter(
    m => !projectMemberIds.has(m.userId || m.user?.id)
  );
  const filteredAvailable = availableMembers.filter(m =>
    (m.user?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.user?.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!selectedUserId) return;
    setError('');

    // Find the user from workspace members for optimistic display
    const wsm = availableMembers.find(m => (m.userId || m.user?.id) === selectedUserId);
    const user = wsm?.user || { id: selectedUserId, name: 'Member', email: '' };
    const tempMember = { userId: selectedUserId, projectRole: selectedRole, user };

    // Optimistic: add to Redux project members instantly
    dispatch({ type: 'project/addProjectMember/fulfilled', payload: { projectId, member: tempMember } });
    // Broadcast to other users
    emitInstant?.('member_added_instant', { member: tempMember });

    setSelectedUserId('');
    setSearch('');

    // Background API
    dispatch(addProjectMember({ projectId, userId: selectedUserId, projectRole: selectedRole }));
  };

  const handleRoleChange = (memberId, newRole) => {
    // Optimistic: update in Redux instantly
    dispatch({ type: 'project/updateProjectMemberRole/fulfilled', payload: { projectId, member: { userId: memberId, projectRole: newRole } } });
    emitInstant?.('member_role_changed_instant', { userId: memberId, projectRole: newRole });
    // Background API
    dispatch(updateProjectMemberRole({ projectId, memberId, projectRole: newRole }));
  };

  const handleRemove = (memberId) => {
    if (!window.confirm('Remove this person from the project?')) return;
    // Optimistic: remove from Redux instantly
    dispatch({ type: 'project/removeProjectMember/fulfilled', payload: { projectId, memberId } });
    emitInstant?.('member_removed_instant', { userId: memberId });
    // Background API
    dispatch(removeProjectMember({ projectId, memberId }));
  };

  return (
    <div className="asana-modal-overlay" onClick={onClose}>
      <div className="asana-modal w-full max-w-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--asana-border)]">
          <h2 className="text-base font-bold text-[var(--asana-text-primary)]">Share "{currentProject?.name}"</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-[var(--asana-text-secondary)] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Add member — Admin only */}
          {isWorkspaceAdmin && (
            <div>
              <label className="block text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-2">
                Add people
              </label>
              <div className="flex space-x-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search workspace members..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setSelectedUserId(''); }}
                    className="asana-input w-full text-sm"
                  />
                  {search && !selectedUserId && filteredAvailable.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-asana shadow-lg max-h-40 overflow-y-auto">
                      {filteredAvailable.map(m => {
                        const uid = m.userId || m.user?.id;
                        return (
                          <button
                            key={uid}
                            onClick={() => { setSelectedUserId(uid); setSearch(m.user?.name || m.user?.email || ''); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center space-x-2"
                          >
                            <div className="w-7 h-7 rounded-full bg-asana-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {m.user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-[var(--asana-text-primary)]">{m.user?.name}</p>
                              <p className="text-xs text-[var(--asana-text-secondary)]">{m.user?.email}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <RoleDropdown value={selectedRole} onChange={setSelectedRole} />
                <button
                  onClick={handleAdd}
                  disabled={!selectedUserId || adding}
                  className="asana-button-primary text-sm px-4 disabled:opacity-50"
                >
                  {adding ? '...' : 'Invite'}
                </button>
              </div>
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          )}

          {/* Current members */}
          <div>
            <p className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-3">
              Project members
              <span className="ml-2 normal-case font-medium text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{projectMembers.length}</span>
            </p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {projectMembers.map(m => {
                const uid = m.userId || m.user?.id;
                const isYou = uid === currentUser?.id;
                return (
                  <div key={uid} className="flex items-center justify-between py-2 px-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 group transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-asana-blue flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {m.user?.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--asana-text-primary)] truncate">
                          {m.user?.name}
                          {isYou && <span className="ml-1.5 text-[10px] bg-asana-blue/10 text-asana-blue px-1.5 py-0.5 rounded-full font-bold">You</span>}
                        </p>
                        <p className="text-xs text-[var(--asana-text-secondary)] truncate">{m.user?.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                      {isWorkspaceAdmin && !isYou ? (
                        <>
                          <RoleDropdown value={m.projectRole || 'EDITOR'} onChange={(val) => handleRoleChange(uid, val)} compact />
                          <button
                            onClick={() => handleRemove(uid)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--asana-text-secondary)] hover:text-red-500 rounded transition-all"
                            title="Remove from project"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${PROJECT_ROLE_STYLE[m.projectRole] || PROJECT_ROLE_STYLE.EDITOR}`}>
                          {PROJECT_ROLE_LABELS[m.projectRole]?.label || 'Editor'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {projectMembers.length === 0 && (
                <p className="text-sm text-[var(--asana-text-secondary)] text-center py-4">No members yet — add someone above.</p>
              )}
            </div>
          </div>

          {/* Role legend */}
          <div className="pt-2 border-t border-[var(--asana-border)]">
            <p className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-2">Role permissions</p>
            <div className="space-y-1.5">
              {Object.entries(PROJECT_ROLE_LABELS).map(([val, { label, desc }]) => (
                <div key={val} className="flex items-start space-x-2">
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 mt-0.5 flex-shrink-0 ${PROJECT_ROLE_STYLE[val]}`}>{label}</span>
                  <span className="text-xs text-[var(--asana-text-secondary)]">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;
