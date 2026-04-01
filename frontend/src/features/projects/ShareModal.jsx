import { useState } from 'react';
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

function ShareModal({ projectId, onClose }) {
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

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    setError('');
    try {
      await dispatch(addProjectMember({ projectId, userId: selectedUserId, projectRole: selectedRole })).unwrap();
      setSelectedUserId('');
      setSearch('');
    } catch (err) {
      setError(err || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await dispatch(updateProjectMemberRole({ projectId, memberId, projectRole: newRole })).unwrap();
    } catch (err) {
      // silently fail — role reverts visually
    }
  };

  const handleRemove = async (memberId) => {
    if (!window.confirm('Remove this person from the project?')) return;
    try {
      await dispatch(removeProjectMember({ projectId, memberId })).unwrap();
    } catch (err) {
      // silently fail
    }
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
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="asana-input text-sm w-32"
                >
                  {Object.entries(PROJECT_ROLE_LABELS).map(([val, { label }]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
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
                          <select
                            value={m.projectRole || 'EDITOR'}
                            onChange={e => handleRoleChange(uid, e.target.value)}
                            className={`text-xs font-bold rounded-full px-2.5 py-1 border-none focus:ring-1 focus:ring-asana-blue/30 cursor-pointer transition-colors ${PROJECT_ROLE_STYLE[m.projectRole] || PROJECT_ROLE_STYLE.EDITOR}`}
                          >
                            {Object.entries(PROJECT_ROLE_LABELS).map(([val, { label }]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
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
