import { useState, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProject, addProjectMember, updateProjectMemberRole, removeProjectMember } from '../../store/slices/projectSlice';
import { fetchWorkspace } from '../../store/slices/workspaceSlice';
import { useRole } from '../../hooks/useRole';
import CustomRoleModal from './CustomRoleModal';
import { useConfirm } from '../../hooks/useConfirm';
import api from '../../services/api';

/* ── Role dropdown — reads from the project's named roles ── */
function RoleDropdown({ roles, value, onChange, compact = false }) {
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
      const spaceBelow = window.innerHeight - rect.bottom;
      setPos({
        top: spaceBelow < 250 ? rect.top - 250 - 4 : rect.bottom + 4,
        left: rect.right - 240,
      });
    }
    setOpen(!open);
  };

  const current = roles.find(r => r.id === value);
  const displayName = current?.name || 'Select role';
  const displayColor = current?.color || '#6B7280';

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className={`flex items-center space-x-1.5 text-xs font-bold rounded-lg px-2.5 py-1.5 transition-colors hover:ring-1 hover:ring-[var(--asana-border)] ${compact ? '' : 'min-w-[100px]'}`}
        style={{ backgroundColor: `${displayColor}20`, color: displayColor }}>
        <span>{displayName}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div ref={ref} className="fixed z-[200] w-60 bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl shadow-2xl py-1 animate-fade-in max-h-72 overflow-y-auto"
          style={{ top: pos.top, left: Math.max(8, pos.left) }}>
          {roles.map((role) => {
            const isActive = value === role.id;
            return (
              <button key={role.id} onClick={() => { onChange(role.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isActive ? 'bg-asana-blue/5' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold inline-block px-2 py-0.5 rounded"
                      style={{ backgroundColor: `${role.color}20`, color: role.color }}>
                      {role.name}
                    </span>
                    {role.description && (
                      <p className="text-[10px] text-[var(--asana-text-secondary)] mt-0.5 ml-0.5">{role.description}</p>
                    )}
                    {role.isSystem && (
                      <p className="text-[10px] text-[var(--asana-text-secondary)] mt-0.5 ml-0.5">
                        {role.name === 'Editor' ? 'Full edit access' : role.name === 'Commenter' ? 'View + comment only' : 'Read-only'}
                      </p>
                    )}
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
          {/* Create custom role option at the bottom */}
          <div className="border-t border-[var(--asana-border)] mt-1 pt-1">
            <button onClick={() => { onChange('__CREATE_CUSTOM__'); setOpen(false); }}
              className="w-full flex items-center px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <svg className="w-3.5 h-3.5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">Create custom role...</span>
            </button>
          </div>
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
  const { isWorkspaceAdmin, can } = useRole();
  const canInvite = isWorkspaceAdmin || can('project.invite');
  const { confirm, ConfirmDialog } = useConfirm();

  const [search, setSearch] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  // Project's named roles (system + custom)
  const [projectRoles, setProjectRoles] = useState([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  // Custom role modal
  const [customModalTarget, setCustomModalTarget] = useState(null);
  // { memberId, memberName, roleId, permissions } or { mode: 'create', memberId }

  // Load project roles
  useEffect(() => {
    if (!projectId) return;
    const wsId = currentWorkspace?.id;
    if (!wsId) { setRolesLoaded(true); return; }
    api.get(`/api/v1/projects/roles/workspace/${wsId}`).then((res) => {
      const roles = res.data.data || [];
      setProjectRoles(roles);
      // Default to Editor for new member invites
      const editor = roles.find(r => r.isSystem && r.name === 'Editor');
      if (editor && !selectedRoleId) setSelectedRoleId(editor.id);
      setRolesLoaded(true);
    }).catch(() => setRolesLoaded(true));
  }, [projectId]);

  // Ensure workspace members are loaded for the invite search
  useEffect(() => {
    if (currentWorkspace?.id && !Array.isArray(currentWorkspace.members)) {
      dispatch(fetchWorkspace(currentWorkspace.id));
    }
  }, [currentWorkspace?.id, currentWorkspace?.members, dispatch]);

  const projectMembers = currentProject?.members || [];
  const projectMemberIds = new Set(projectMembers.map(m => m.userId));
  const availableMembers = (currentWorkspace?.members || []).filter(
    m => !projectMemberIds.has(m.userId || m.user?.id)
  );
  const filteredAvailable = availableMembers.filter(m =>
    (m.user?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.user?.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!selectedUserId || !selectedRoleId) return;
    setError('');
    const wsm = availableMembers.find(m => (m.userId || m.user?.id) === selectedUserId);
    const user = wsm?.user || { id: selectedUserId, name: 'Member', email: '' };
    const role = projectRoles.find(r => r.id === selectedRoleId);
    // Map to a valid enum value: system roles use their name, custom roles use 'CUSTOM'
    const enumMap = { Editor: 'EDITOR', Commenter: 'COMMENTER', Viewer: 'VIEWER' };
    const enumValue = role?.isSystem ? (enumMap[role.name] || 'EDITOR') : 'CUSTOM';
    const tempMember = { userId: selectedUserId, projectRole: enumValue, projectRoleId: selectedRoleId, customRole: role, user };

    dispatch({ type: 'project/addProjectMember/fulfilled', payload: { projectId, member: tempMember } });
    emitInstant?.('member_added_instant', { member: tempMember });
    setSelectedUserId('');
    setSearch('');
    dispatch(addProjectMember({ projectId, userId: selectedUserId, projectRole: enumValue, roleId: selectedRoleId }));
  };

  const handleRoleChange = (memberId, newRoleId) => {
    if (newRoleId === '__CREATE_CUSTOM__') {
      // Open custom role creator, pre-targeted at this member
      setCustomModalTarget({ mode: 'create', memberId, memberName: projectMembers.find(m => (m.userId || m.user?.id) === memberId)?.user?.name || 'Member' });
      return;
    }
    // Apply the named role
    dispatch(updateProjectMemberRole({ projectId, memberId, roleId: newRoleId }));
    emitInstant?.('member_role_changed_instant', { userId: memberId, roleId: newRoleId });
  };

  const handleSaveCustomRole = async (permissions, roleName) => {
    if (!customModalTarget) return;
    try {
      // Create the new custom role
      const res = await api.post(`/api/v1/projects/roles/workspace/${currentWorkspace?.id}`, {
        name: roleName || `Custom Role`,
        permissions,
        color: '#8B5CF6',
      });
      const newRole = res.data.data;
      setProjectRoles(prev => [...prev, newRole]);

      // Assign the member to this new role
      if (customModalTarget.memberId) {
        dispatch(updateProjectMemberRole({ projectId, memberId: customModalTarget.memberId, roleId: newRole.id }));
      }
    } catch (err) {
      console.error('Failed to create custom role:', err);
    }
    setCustomModalTarget(null);
  };

  const handleEditRole = (role) => {
    setCustomModalTarget({ mode: 'edit', roleId: role.id, roleName: role.name, permissions: role.permissions });
  };

  const handleUpdateRole = async (permissions) => {
    if (!customModalTarget?.roleId) return;
    try {
      await api.put(`/api/v1/projects/roles/${customModalTarget.roleId}`, { permissions });
      // Update local projectRoles state
      setProjectRoles(prev => prev.map(r => r.id === customModalTarget.roleId ? { ...r, permissions } : r));
      // Also refresh the project to update member.customRole in Redux
      // so the next edit-click shows fresh data (not stale from the member row).
      dispatch(fetchProject(projectId));
    } catch (err) {
      console.error('Failed to update role:', err);
    }
    setCustomModalTarget(null);
  };

  const handleRemove = async (memberId) => {
    const ok = await confirm({ title: 'Remove member?', message: 'This person will lose access to the project.', confirmText: 'Remove', variant: 'danger' });
    if (!ok) return;
    dispatch({ type: 'project/removeProjectMember/fulfilled', payload: { projectId, memberId } });
    emitInstant?.('member_removed_instant', { userId: memberId });
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
          {canInvite && rolesLoaded && (
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
                <RoleDropdown roles={projectRoles} value={selectedRoleId} onChange={(id) => {
                  if (id === '__CREATE_CUSTOM__') {
                    setCustomModalTarget({ mode: 'create', memberId: null, memberName: '' });
                  } else {
                    setSelectedRoleId(id);
                  }
                }} />
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
                const memberRole = m.customRole || projectRoles.find(r => r.id === m.projectRoleId);
                const memberRoleId = m.projectRoleId || memberRole?.id || '';

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
                          {uid === currentProject?.createdById && <span className="ml-1.5 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-bold">Creator</span>}
                        </p>
                        <p className="text-xs text-[var(--asana-text-secondary)] truncate">{m.user?.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                      {canInvite && !isYou && rolesLoaded ? (
                        <>
                          <RoleDropdown roles={projectRoles} value={memberRoleId} onChange={(id) => handleRoleChange(uid, id)} compact />
                          {/* Edit permissions icon for custom roles */}
                          {memberRole && !memberRole.isSystem && (
                            <button onClick={() => handleEditRole(memberRole)}
                              className="p-1 rounded-md text-[var(--asana-text-secondary)] hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 transition-colors"
                              title="Edit role permissions">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          )}
                          {(uid !== currentProject?.createdById || isWorkspaceAdmin) && (
                            <button
                              onClick={() => handleRemove(uid)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--asana-text-secondary)] hover:text-red-500 rounded transition-all"
                              title="Remove from project"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-bold rounded-full px-2.5 py-1"
                          style={{ backgroundColor: `${memberRole?.color || '#6B7280'}20`, color: memberRole?.color || '#6B7280' }}>
                          {memberRole?.name || m.projectRole || 'Member'}
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

          {/* Roles management — admins can edit/delete, others see a read-only legend */}
          <div className="pt-2 border-t border-[var(--asana-border)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Project roles</p>
              {canInvite && (
                <button
                  onClick={() => setCustomModalTarget({ mode: 'create', memberId: null, memberName: '' })}
                  className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                >
                  + New role
                </button>
              )}
            </div>
            <div className="space-y-1">
              {projectRoles.map((role) => (
                <div key={role.id} className="flex items-center justify-between py-1.5 px-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 group/role transition-colors">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0"
                      style={{ backgroundColor: `${role.color}20`, color: role.color }}>
                      {role.name}
                    </span>
                    <span className="text-xs text-[var(--asana-text-secondary)] truncate">
                      {role.isSystem
                        ? (role.name === 'Editor' ? 'Full edit access' : role.name === 'Commenter' ? 'View + comment' : 'Read-only')
                        : `${Object.values(role.permissions || {}).filter(Boolean).length} permissions`
                      }
                    </span>
                    {role.isSystem && (
                      <span className="text-[9px] text-[var(--asana-text-muted)] bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">System</span>
                    )}
                  </div>

                  {canInvite && (
                    <div className="flex items-center space-x-1 opacity-0 group-hover/role:opacity-100 transition-opacity">
                      {/* Edit permissions */}
                      <button
                        onClick={() => handleEditRole(role)}
                        className="p-1 rounded text-[var(--asana-text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-[var(--asana-text-primary)] transition-colors"
                        title={`Edit ${role.name} permissions`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {/* Delete — only for non-system roles */}
                      {!role.isSystem && (
                        <button
                          onClick={async () => {
                            const memberCount = role._count?.members || 0;
                            const msg = memberCount > 0
                              ? `${memberCount} member(s) using this role will be reassigned to Viewer.`
                              : 'This role will be permanently deleted.';
                            const ok = await confirm({ title: `Delete "${role.name}"?`, message: msg, confirmText: 'Delete Role', variant: 'danger' });
                            if (!ok) return;
                            try {
                              await api.delete(`/api/v1/projects/roles/${role.id}`);
                              setProjectRoles(prev => prev.filter(r => r.id !== role.id));
                            } catch (err) {
                              console.error('Failed to delete role:', err);
                            }
                          }}
                          className="p-1 rounded text-[var(--asana-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                          title={`Delete ${role.name}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom role modal */}
      {ConfirmDialog}
      {customModalTarget && (
        <CustomRoleModal
          currentPermissions={customModalTarget.permissions || null}
          memberName={customModalTarget.memberName || ''}
          showNameField={customModalTarget.mode === 'create'}
          roleName={customModalTarget.roleName || ''}
          projectId={projectId}
          onSave={customModalTarget.mode === 'edit' ? handleUpdateRole : handleSaveCustomRole}
          onCancel={() => setCustomModalTarget(null)}
        />
      )}
    </div>
  );
}

export default ShareModal;
