import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchWorkspace, fetchInvites, resendInvite, cancelInvite, updateWorkspace, deleteWorkspace } from '../../store/slices/workspaceSlice';
import { fetchProjects } from '../../store/slices/projectSlice';
import InviteModal from './InviteModal';
import CustomRoleModal from '../projects/CustomRoleModal';
import { useConfirm } from '../../hooks/useConfirm';
import api from '../../services/api';

const ROLE_STYLE = {
  OWNER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ADMIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  MEMBER: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  GUEST: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
};

const SYSTEM_ROLE_OPTIONS = [
  { value: 'ADMIN',  label: 'Admin',   color: '#3B82F6', desc: 'Manage members & settings' },
  { value: 'MEMBER', label: 'Manager', color: '#10B981', desc: 'View and edit assigned projects' },
  { value: 'GUEST',  label: 'Guest',   color: '#F59E0B', desc: 'View only explicitly added projects' },
];

function WorkspaceRoleDropdown({ value, onChange, wsCustomRoles = [] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      setPos({
        top: spaceBelow < 260 ? r.top - 4 - Math.min(260, spaceBelow + r.height) : r.bottom + 4,
        left: r.right - 220,
      });
    }
    setOpen(o => !o);
  };

  // Resolve display for current value
  const isCustom = value?.startsWith('custom:');
  const customId = isCustom ? value.replace('custom:', '') : null;
  const customRole = customId ? wsCustomRoles.find(r => r.id === customId) : null;
  const systemRole = !isCustom ? SYSTEM_ROLE_OPTIONS.find(r => r.value === value) : null;
  const displayLabel = customRole?.name || systemRole?.label || value;
  const displayColor = customRole?.color || systemRole?.color || '#6B7280';

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:ring-1 hover:ring-[var(--karya-border)] focus:outline-none"
        style={{ backgroundColor: `${displayColor}18`, color: displayColor }}>
        <span className="uppercase tracking-wide">{displayLabel}</span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div ref={dropRef}
          className="fixed z-[9999] w-56 bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-xl shadow-2xl py-1.5 overflow-hidden"
          style={{ top: pos.top, left: Math.max(8, pos.left) }}>

          {/* System roles */}
          <p className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--karya-text-secondary)]">System Roles</p>
          {SYSTEM_ROLE_OPTIONS.map(opt => {
            const active = value === opt.value;
            return (
              <button key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${active ? 'bg-gray-50 dark:bg-gray-800/40' : ''}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: opt.color }}>{opt.label}</p>
                  <p className="text-[10px] text-[var(--karya-text-secondary)] truncate">{opt.desc}</p>
                </div>
                {active && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: opt.color }}>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Custom roles */}
          {wsCustomRoles.length > 0 && (
            <>
              <div className="h-px bg-[var(--karya-border)] mx-2 my-1" />
              <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--karya-text-secondary)]">Custom Roles</p>
              {wsCustomRoles.map(cr => {
                const crValue = `custom:${cr.id}`;
                const active = value === crValue;
                const color = cr.color || '#8B5CF6';
                return (
                  <button key={cr.id}
                    onClick={() => { onChange(crValue); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${active ? 'bg-gray-50 dark:bg-gray-800/40' : ''}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <p className="text-xs font-bold flex-1" style={{ color }}>{cr.name}</p>
                    {active && (
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Simple roles card for the workspace overview — flat list of all roles.
 * System roles (Editor/Commenter/Viewer) are read-only. Custom roles can be edited/deleted.
 * A "Create Role" button opens the permission modal for any selected project.
 */
function ProjectRolesCard({ workspaceId, isAdmin }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customModalTarget, setCustomModalTarget] = useState(null);
  const { confirm: confirmRole, ConfirmDialog: RoleConfirmDialog } = useConfirm();

  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }
    let cancelled = false;
    api.get(`/api/v1/projects/roles/workspace/${workspaceId}`)
      .then(res => { if (!cancelled) setRoles(res.data.data || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);
  // Deduplicate system roles by name (they're the same across projects)
  const uniqueSystem = [];
  const seenNames = new Set();
  systemRoles.forEach(r => { if (!seenNames.has(r.name)) { seenNames.add(r.name); uniqueSystem.push(r); } });

  return (
    <>
      <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--karya-text-primary)]">Roles</h3>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-7 bg-gray-200 dark:bg-gray-700 rounded" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {/* System roles — permissions editable by admin/owner, name locked */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--karya-text-secondary)] mb-2">Default Roles</p>
              <div className="space-y-1.5">
                {/* Workspace-level Admin role — static entry */}
                <div className="flex items-center space-x-2.5 py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#8B5CF620', color: '#8B5CF6' }}>
                    Admin
                  </span>
                  <span className="text-xs text-[var(--karya-text-secondary)] truncate">
                    Can manage members, invites, and workspace settings
                  </span>
                  <div className="ml-auto flex items-center space-x-1 flex-shrink-0">
                    <span className="text-[9px] text-[var(--karya-text-muted)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  </div>
                </div>
                {uniqueSystem.map(role => (
                  <div key={role.name} className="flex items-center space-x-2.5 py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 group/sr transition-colors">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `${role.color}20`, color: role.color }}>
                      {role.name}
                    </span>
                    <span className="text-xs text-[var(--karya-text-secondary)] truncate">
                      {role.name === 'Manager'
                        ? 'Can view and edit projects they have access to'
                        : role.name === 'Commenter'
                          ? 'View + comment only'
                          : role.name === 'Guest'
                            ? 'Can only view projects they are explicitly added to'
                            : 'Read-only'}
                    </span>
                    <div className="ml-auto flex items-center space-x-1 flex-shrink-0">
                      <span className="text-[9px] text-[var(--karya-text-muted)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                        Default
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => setCustomModalTarget({ mode: 'edit', roleId: role.id, roleName: role.name, permissions: role.permissions, isSystem: true })}
                          className="p-1 rounded text-[var(--karya-text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-[var(--karya-text-primary)] transition-colors opacity-0 group-hover/sr:opacity-100"
                          title="Edit permissions">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom roles — editable + deletable */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--karya-text-secondary)] mb-2">Custom Roles</p>
              {customRoles.length === 0 ? (
                <p className="text-xs text-[var(--karya-text-muted)] italic py-2">No custom roles yet. Create one below.</p>
              ) : (
                <div className="space-y-1">
                  {customRoles.map(role => (
                    <div key={role.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 group/cr transition-colors">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `${role.color}20`, color: role.color }}>
                          {role.name}
                        </span>
                        <span className="text-[10px] text-purple-500 flex-shrink-0">
                          {Object.values(role.permissions || {}).filter(Boolean).length} permissions
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover/cr:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => setCustomModalTarget({ mode: 'edit', roleId: role.id, roleName: role.name, permissions: role.permissions, projectId: role.projectId })}
                          className="p-1 rounded text-[var(--karya-text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-[var(--karya-text-primary)] transition-colors"
                          title="Edit permissions">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirmRole({ title: `Delete "${role.name}"?`, message: 'Members using it will be reassigned to Viewer.', confirmText: 'Delete', variant: 'danger' });
                            if (!ok) return;
                            api.delete(`/api/v1/projects/roles/${role.id}`).then(() => {
                              setRoles(prev => prev.filter(r => r.id !== role.id));
                            }).catch(err => console.error(err));
                          }}
                          className="p-1 rounded text-[var(--karya-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                          title="Delete role">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create custom role */}
            <div className="pt-2 border-t border-[var(--karya-border)]">
              <button
                onClick={() => setCustomModalTarget({ mode: 'create' })}
                className="flex items-center text-xs px-3 py-1.5 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors w-full justify-center"
              >
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Custom Role
              </button>
            </div>
          </div>
        )}
      </div>

      {customModalTarget && (
        <CustomRoleModal
          currentPermissions={customModalTarget.permissions || null}
          memberName=""
          showNameField={customModalTarget.mode === 'create'}
          roleName={customModalTarget.roleName || ''}
          onSave={async (permissions, roleName) => {
            const { mode, roleId } = customModalTarget;
            try {
              if (mode === 'create') {
                const res = await api.post(`/api/v1/projects/roles/workspace/${workspaceId}`, { name: roleName, permissions, color: '#8B5CF6' });
                setRoles(prev => [...prev, res.data.data]);
              } else {
                await api.put(`/api/v1/projects/roles/${roleId}`, { name: roleName, permissions });
                setRoles(prev => prev.map(r => r.id === roleId ? { ...r, name: roleName || r.name, permissions } : r));
              }
              setCustomModalTarget(null);
            } catch (err) {
              // Re-throw so CustomRoleModal can display the error inline
              throw new Error(err.response?.data?.message || err.message || 'Failed to save role');
            }
          }}
          onCancel={() => setCustomModalTarget(null)}
        />
      )}
      {RoleConfirmDialog}
    </>
  );
}

/**
 * Full-page skeleton mirroring the Workspace layout so the user sees the
 * structure immediately on navigation. Replaced atomically with real content
 * once fetchWorkspace, fetchInvites, and fetchProjects (for this workspaceId)
 * have all resolved.
 */
function WorkspaceSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden animate-pulse">
      {/* Header strip */}
      <div className="bg-[var(--karya-surface)] border-b border-[var(--karya-border)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded-md" />
            </div>
          </div>
          <div className="flex space-x-1 pb-1">
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-[var(--karya-bg)]">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          {/* Hero card */}
          <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] overflow-hidden">
            <div className="h-24 bg-gray-200 dark:bg-gray-700" />
            <div className="px-6 pb-6 -mt-8">
              <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 border-4 border-[var(--karya-surface)]" />
              <div className="h-5 w-56 bg-gray-200 dark:bg-gray-700 rounded mt-3" />
              <div className="h-3 w-72 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
            </div>
          </div>

          {/* Projects + sidebar grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {/* Projects card */}
            <div className="lg:col-span-2 bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3 px-3 py-2.5 rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded flex-1" style={{ maxWidth: `${50 + (i * 10) % 40}%` }} />
                    <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                ))}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-6">
              {/* Members card */}
              <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="flex items-center space-x-1.5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                  ))}
                </div>
              </div>

              {/* Stats card */}
              <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
                <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                <div className="space-y-2.5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
                      <div className="h-3 w-6 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Workspace() {
  const { workspaceId } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const { currentWorkspace, pendingInvites } = useAppSelector((state) => state.workspace);
  const { projects, projectsForWorkspaceId } = useAppSelector((state) => state.project);
  const { user: currentUser } = useAppSelector((state) => state.auth);

  // Inline-edit state for the team description on the Overview tab.
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const descriptionInputRef = useRef(null);

  // Inline-edit state for workspace name (owner only).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef(null);

  // Track per-workspaceId readiness for both async dependencies so the page
  // shows a single skeleton until everything is loaded — no partial flashes.
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [invitesReady, setInvitesReady] = useState(false);

  // Custom project roles (for the workspace member role dropdown)
  const [wsCustomRoles, setWsCustomRoles] = useState([]);
  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/api/v1/projects/roles/workspace/${workspaceId}`)
      .then(res => setWsCustomRoles((res.data.data || []).filter(r => !r.isSystem)))
      .catch(() => {});
  }, [workspaceId]);

  // Real-time: refresh when an invite is accepted (so pending list clears + new member shows)
  useEffect(() => {
    if (!workspaceId) return;
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const token = localStorage.getItem('accessToken');
    let socket;
    (async () => {
      const ioMod = await import('socket.io-client');
      socket = ioMod.default(socketUrl, { auth: { token }, transports: ['websocket'] });
      socket.on('connect', () => socket.emit('join_workspace', workspaceId));
      socket.on('invite_accepted', () => {
        dispatch(fetchWorkspace(workspaceId));
        dispatch(fetchInvites(workspaceId));
      });
      // Workspace-level role changes (Members tab dropdown)
      socket.on('workspace_member_role_changed', () => {
        dispatch(fetchWorkspace(workspaceId));
      });
      // Workspace member removed
      socket.on('workspace_member_removed', () => {
        dispatch(fetchWorkspace(workspaceId));
      });
      // Also refresh when a project member changes — someone picking a custom
      // role in the Members dropdown applies it to every project, and each
      // project emits its own `member_role_changed` via the existing API.
      socket.on('member_role_changed', () => {
        dispatch(fetchWorkspace(workspaceId));
      });
    })();
    return () => { if (socket) socket.disconnect(); };
  }, [workspaceId, dispatch]);

  // Toast for role change confirmation
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    // Reset readiness when the workspaceId changes so the skeleton reappears
    // for the new workspace's load.
    setWorkspaceReady(false);
    setInvitesReady(false);
    let cancelled = false;
    Promise.resolve(dispatch(fetchWorkspace(workspaceId))).finally(() => {
      if (!cancelled) setWorkspaceReady(true);
    });
    Promise.resolve(dispatch(fetchInvites(workspaceId))).finally(() => {
      if (!cancelled) setInvitesReady(true);
    });
    // Ensure projects for this workspace are fetched — without this,
    // projectsForWorkspaceId stays stale after joining a new workspace
    // and the skeleton never clears.
    if (projectsForWorkspaceId !== workspaceId) {
      dispatch(fetchProjects(workspaceId));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, dispatch]);

  // The Workspace.members list and current-workspace identity must match the
  // requested URL — guards against the brief moment after navigation when
  // currentWorkspace still points at the previous workspace.
  const workspaceMatches = currentWorkspace?.id === workspaceId;
  const projectsMatch = projectsForWorkspaceId === workspaceId;
  // projectsMatch is "best-effort" — if projects fail to load we still render
  // the page (workspace data is enough for the Overview and Members tabs).
  const allReady = workspaceReady && invitesReady && workspaceMatches;

  // Keep the draft in sync with the current workspace whenever it changes
  // (e.g., after fetchWorkspace resolves or after another admin edits it).
  useEffect(() => {
    if (!editingDescription) {
      setDescriptionDraft(currentWorkspace?.description || '');
    }
  }, [currentWorkspace?.description, editingDescription]);

  const startEditingDescription = () => {
    if (!isAdmin) return;
    setDescriptionDraft(currentWorkspace?.description || '');
    setEditingDescription(true);
    setTimeout(() => descriptionInputRef.current?.focus(), 0);
  };

  const saveDescription = async () => {
    const next = descriptionDraft.trim();
    // No-op if unchanged
    if (next === (currentWorkspace?.description || '').trim()) {
      setEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      await dispatch(updateWorkspace({ workspaceId, data: { description: next } })).unwrap();
      setEditingDescription(false);
    } catch (e) {
      // keep edit mode open on failure so user can retry
    } finally {
      setSavingDescription(false);
    }
  };

  const cancelEditingDescription = () => {
    setDescriptionDraft(currentWorkspace?.description || '');
    setEditingDescription(false);
  };

  const currentMember = currentWorkspace?.members?.find(m => m.userId === currentUser?.id || m.user?.id === currentUser?.id);
  const isAdmin = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN'
    || currentWorkspace?.role === 'OWNER' || currentWorkspace?.role === 'ADMIN';
  const isOwner = currentMember?.role === 'OWNER' || currentWorkspace?.role === 'OWNER';

  const startEditingName = () => {
    setNameDraft(currentWorkspace?.name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === currentWorkspace?.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await dispatch(updateWorkspace({ workspaceId, data: { name: next } })).unwrap();
      setEditingName(false);
    } catch {} finally { setSavingName(false); }
  };

  const handleDeleteWorkspace = async () => {
    const ok = await confirm({
      title: 'Delete workspace?',
      message: `All projects, tasks, and members will be permanently removed. Type the workspace name to confirm.`,
      confirmText: 'Delete Workspace',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dispatch(deleteWorkspace(workspaceId)).unwrap();
      navigate('/');
    } catch (err) {
      showToast(err || 'Failed to delete workspace', 'error');
    }
  };

  if (!allReady) {
    return <WorkspaceSkeleton />;
  }

  if (!currentWorkspace) {
    return <div className="p-8 text-center text-[var(--karya-text-secondary)]">Workspace not found</div>;
  }

  const members = currentWorkspace.members?.map(m => ({
    id: m.user?.id || m.userId,
    name: m.user?.name,
    email: m.user?.email,
    avatar: m.user?.avatar,
    role: m.role,
    customRoleId: m.customRoleId || m.customRole?.id || null,
    customRoleName: m.customRole?.name || null,
    status: 'active',
  })) || [];

  const invites = pendingInvites.map(inv => ({
    id: inv.id,
    name: inv.email,
    email: inv.email,
    role: inv.role,
    status: 'pending',
    invitedBy: inv.invitedBy?.name,
  }));

  const tabs = ['Overview', 'Members'];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-[var(--karya-surface)] border-b border-[var(--karya-border)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-karya-coral to-[#e04030] flex items-center justify-center text-white font-bold text-sm">
                {currentWorkspace.name?.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-base font-bold text-[var(--karya-text-primary)]">{currentWorkspace.name}</h1>
            </div>
            <div className="flex items-center space-x-2">
              {members.slice(0, 3).map((m, i) => (
                <div key={m.id} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: `hsl(${(m.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}>
                  {m.name?.charAt(0).toUpperCase()}
                </div>
              ))}
              {isAdmin && (
                <button onClick={() => setShowInviteModal(true)}
                  className="karya-button-primary flex items-center text-xs px-3 py-1.5">
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Invite
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1">
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab.toLowerCase())}
                className={`px-4 py-2 text-sm font-medium transition-all relative rounded-t-md ${
                  activeTab === tab.toLowerCase() ? 'text-karya-blue' : 'text-[var(--karya-text-secondary)] hover:text-[var(--karya-text-primary)]'
                }`}>
                {tab}
                {activeTab === tab.toLowerCase() && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-karya-blue rounded-t-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-[var(--karya-bg)]">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Team hero */}
              <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] overflow-hidden">
                <div className="h-24 bg-gradient-to-r from-gray-700 to-gray-900 dark:from-gray-800 dark:to-gray-950" />
                <div className="px-6 pb-6 -mt-8">
                  <div className="w-16 h-16 rounded-full bg-gray-400 dark:bg-gray-600 border-4 border-[var(--karya-surface)] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {currentWorkspace.name?.charAt(0).toUpperCase()}
                  </div>
                  {editingName ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={e => setNameDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingName(false); }
                        }}
                        disabled={savingName}
                        className="text-xl font-bold bg-[var(--karya-bg)] border border-karya-blue rounded-md px-2 py-0.5 text-[var(--karya-text-primary)] outline-none focus:ring-1 focus:ring-karya-blue disabled:opacity-50 w-64"
                      />
                      <button onClick={saveName} disabled={savingName}
                        className="karya-button-primary text-xs px-3 py-1.5 disabled:opacity-50">
                        {savingName ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingName(false)} disabled={savingName}
                        className="text-xs px-3 py-1.5 rounded text-[var(--karya-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 group/name">
                      <h2 className="text-xl font-bold text-[var(--karya-text-primary)]">{currentWorkspace.name}</h2>
                      {isOwner && (
                        <button onClick={startEditingName}
                          className="opacity-0 group-hover/name:opacity-100 p-1 rounded text-[var(--karya-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                          title="Edit workspace name">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  {editingDescription ? (
                    <div className="mt-2">
                      <textarea
                        ref={descriptionInputRef}
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { e.preventDefault(); cancelEditingDescription(); }
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveDescription(); }
                        }}
                        rows={2}
                        placeholder="Describe what this team is about..."
                        disabled={savingDescription}
                        className="w-full text-sm bg-[var(--karya-bg)] border border-[var(--karya-border)] rounded-md px-3 py-2 text-[var(--karya-text-primary)] placeholder-[var(--karya-text-muted)] outline-none focus:border-karya-blue resize-none disabled:opacity-50"
                      />
                      <div className="mt-2 flex items-center space-x-2">
                        <button
                          onClick={saveDescription}
                          disabled={savingDescription}
                          className="karya-button-primary text-xs px-3 py-1.5 inline-flex items-center disabled:opacity-50"
                        >
                          {savingDescription ? (
                            <svg className="animate-spin w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                          ) : null}
                          {savingDescription ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditingDescription}
                          disabled={savingDescription}
                          className="text-xs px-3 py-1.5 rounded text-[var(--karya-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <span className="text-[10px] text-[var(--karya-text-muted)]">⌘+Enter to save · Esc to cancel</span>
                      </div>
                    </div>
                  ) : (
                    <p
                      onClick={startEditingDescription}
                      className={`text-sm mt-1 ${currentWorkspace.description ? 'text-[var(--karya-text-secondary)]' : 'text-[var(--karya-text-muted)] italic'} ${isAdmin ? 'cursor-pointer hover:text-[var(--karya-text-primary)] transition-colors' : ''}`}
                      title={isAdmin ? 'Click to edit description' : undefined}
                    >
                      {currentWorkspace.description || (isAdmin ? 'Click to add team description...' : 'No description yet.')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                {/* Projects */}
                <div className="lg:col-span-2 bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[var(--karya-text-primary)]">Projects</h3>
                  </div>
                  <div className="space-y-1">
                    {projects.length > 0 ? projects.map(p => (
                      <Link key={p.id} to={`/project/${p.id}`}
                        className="flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: p.color || '#4573D2' }}>
                          {p.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--karya-text-primary)] truncate">{p.name}</p>
                        </div>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[var(--karya-text-secondary)]">
                          {p.visibility?.toLowerCase()}
                        </span>
                      </Link>
                    )) : (
                      <p className="text-sm text-[var(--karya-text-secondary)] text-center py-6">No projects yet</p>
                    )}
                  </div>
                </div>

                {/* Right sidebar */}
                <div className="space-y-6">
                  {/* Members card */}
                  <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-[var(--karya-text-primary)]">Members</h3>
                      <button onClick={() => setActiveTab('members')} className="text-[10px] text-karya-blue hover:underline">
                        View all {members.length}
                      </button>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {members.slice(0, 5).map((m, i) => (
                        <div key={m.id} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: `hsl(${(m.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}
                          title={m.name}>
                          {m.name?.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {isAdmin && (
                        <button onClick={() => setShowInviteModal(true)}
                          className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-[var(--karya-text-secondary)] hover:border-karya-blue hover:text-karya-blue transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats card */}
                  <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
                    <h3 className="text-sm font-bold text-[var(--karya-text-primary)] mb-3">Workspace stats</h3>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--karya-text-secondary)]">Projects</span>
                        <span className="text-xs font-bold text-[var(--karya-text-primary)]">{projects.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--karya-text-secondary)]">Members</span>
                        <span className="text-xs font-bold text-[var(--karya-text-primary)]">{members.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--karya-text-secondary)]">Pending invites</span>
                        <span className="text-xs font-bold text-[var(--karya-text-primary)]">{invites.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Invitations card — admin-only, dedicated section like the old layout */}
                  {isAdmin && invites.length > 0 && (
                    <div className="bg-[var(--karya-surface)] rounded-xl border border-[var(--karya-border)] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-[var(--karya-text-primary)]">Pending Invitations</h3>
                        <span className="text-[10px] font-bold text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
                          {invites.length}
                        </span>
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {invites.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group/inv">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3.5 h-3.5 text-yellow-700 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[var(--karya-text-primary)] truncate">{inv.email}</p>
                                <p className="text-[10px] text-[var(--karya-text-secondary)]">
                                  {inv.role} · invited{inv.invitedBy ? ` by ${inv.invitedBy}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => dispatch(resendInvite(inv.id))}
                                className="p-1.5 rounded text-[var(--karya-text-secondary)] hover:bg-karya-blue/10 hover:text-karya-blue opacity-0 group-hover/inv:opacity-100 transition-all"
                                title="Resend invitation"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                              <button
                                onClick={async () => {
                                  if (await confirm({ title: 'Cancel invitation?', message: `The invitation for ${inv.email} will be revoked and the email link will stop working.`, confirmText: 'Cancel Invite', variant: 'warning' })) {
                                    dispatch(cancelInvite(inv.id));
                                  }
                                }}
                                className="p-1.5 rounded text-[var(--karya-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover/inv:opacity-100 transition-all"
                                title="Delete invitation"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Project Roles card — admin-only, workspace-level roles */}
                  {isAdmin && <ProjectRolesCard workspaceId={workspaceId} isAdmin={isAdmin} />}
                </div>
              </div>

              {/* Danger Zone — owner only */}
              {isOwner && (
                <div className="bg-[var(--karya-surface)] rounded-xl border border-red-200 dark:border-red-800/50 overflow-hidden">
                  <div className="px-6 py-4 border-b border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10">
                    <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
                    <p className="text-xs text-red-500/80 dark:text-red-400/70 mt-0.5">Actions here are irreversible. Proceed with caution.</p>
                  </div>
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--karya-text-primary)]">Delete this workspace</p>
                      <p className="text-xs text-[var(--karya-text-secondary)] mt-0.5">Permanently removes all projects, tasks, and members.</p>
                    </div>
                    <button
                      onClick={handleDeleteWorkspace}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Members tab ── */
            <div className="bg-[var(--karya-surface)] border border-[var(--karya-border)] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--karya-border)] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--karya-text-primary)]">
                  Members & Invites
                  <span className="ml-2 text-xs font-medium text-[var(--karya-text-secondary)] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {members.length + invites.length}
                  </span>
                </h2>
                {isAdmin && (
                  <button onClick={() => setShowInviteModal(true)}
                    className="karya-button-primary flex items-center text-xs px-3 py-1.5">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Invite
                  </button>
                )}
              </div>

              <div className="divide-y divide-[var(--karya-border)]">
                {[...members, ...invites].map((person) => (
                  <div key={person.id}
                    className={`group flex items-center justify-between px-6 py-3.5 transition-colors ${
                      person.status === 'pending' ? 'bg-yellow-50/30 dark:bg-yellow-900/5' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                    }`}>
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: person.status === 'pending' ? '#9CA3AF' : `hsl(${(person.name?.charCodeAt(0) || 0) * 15}, 60%, 50%)` }}>
                        {person.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--karya-text-primary)]">
                          {person.name}
                          {person.id === currentUser?.id && (
                            <span className="ml-2 text-[10px] bg-karya-blue/10 text-karya-blue px-1.5 py-0.5 rounded-full font-bold">You</span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--karya-text-secondary)]">
                          {person.status === 'pending' ? `Invited${person.invitedBy ? ` by ${person.invitedBy}` : ''}` : person.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {person.status === 'pending' ? (
                        <>
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">Pending</span>
                          {isAdmin && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => dispatch(resendInvite(person.id))}
                                className="p-1.5 rounded-md text-[var(--karya-text-secondary)] hover:bg-karya-blue/10 hover:text-karya-blue transition-colors"
                                title="Resend invitation"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                              <button
                                onClick={async () => {
                                  if (await confirm({ title: 'Cancel invitation?', message: `The invitation for ${person.email} will be revoked and the email link will stop working.`, confirmText: 'Cancel Invite', variant: 'warning' })) {
                                    dispatch(cancelInvite(person.id));
                                  }
                                }}
                                className="p-1.5 rounded-md text-[var(--karya-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="Delete invitation"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center space-x-2">
                          {isAdmin && person.role !== 'OWNER' && person.id !== currentUser?.id ? (
                            <WorkspaceRoleDropdown
                              value={person.customRoleId ? `custom:${person.customRoleId}` : person.role}
                              wsCustomRoles={wsCustomRoles}
                              onChange={async (newValue) => {
                              const e = { target: { value: newValue } };
                                const value = e.target.value;
                                const isCustom = value.startsWith('custom:');
                                const customRoleId = isCustom ? value.slice(7) : null;
                                const newRole = isCustom ? 'MEMBER' : value;
                                try {
                                  // 1. Update the workspace-level role (persists customRoleId too)
                                  await api.put(`/api/v1/workspaces/${workspaceId}/members/${person.id}/role`, {
                                    userId: person.id,
                                    role: newRole,
                                    customRoleId,
                                  });

                                  // 2. If custom role selected, apply it to EVERY project in the workspace
                                  if (customRoleId) {
                                    // Fetch the authoritative list of workspace projects (Redux might be stale)
                                    const wsProjectsRes = await api.get(`/api/v1/projects/workspace/${workspaceId}`);
                                    const wsProjects = wsProjectsRes.data.data || [];

                                    // For each project: try update first, fall back to add if not a member
                                    await Promise.all(wsProjects.map(async (p) => {
                                      try {
                                        await api.put(`/api/v1/projects/${p.id}/members/${person.id}/role`, { roleId: customRoleId });
                                      } catch (err) {
                                        if (err.response?.status === 404 || err.response?.status === 400) {
                                          // Not a project member yet → add them
                                          try {
                                            await api.post(`/api/v1/projects/${p.id}/members`, { userId: person.id, roleId: customRoleId });
                                          } catch (addErr) {
                                            console.warn(`Failed to add ${person.name} to project ${p.name}:`, addErr.response?.data?.message);
                                          }
                                        } else {
                                          console.warn(`Failed to update role in project ${p.name}:`, err.response?.data?.message);
                                        }
                                      }
                                    }));
                                  }

                                  const label = isCustom
                                    ? (wsCustomRoles.find(r => r.id === customRoleId)?.name || 'custom role')
                                    : newRole;
                                  showToast(`${person.name}'s role updated to ${label}`);
                                  dispatch(fetchWorkspace(workspaceId));
                                } catch (err) {
                                  showToast(err.response?.data?.message || 'Failed to update role', 'error');
                                  console.error('Failed to update role:', err);
                                }
                              }}
                            />
                          ) : (
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg ${ROLE_STYLE[person.role] || ROLE_STYLE.MEMBER}`}>
                              {person.customRoleName
                                ? person.customRoleName
                                : person.role === 'MEMBER' ? 'Manager' : person.role.charAt(0) + person.role.slice(1).toLowerCase()}
                            </span>
                          )}
                          {isAdmin && person.role !== 'OWNER' && person.id !== currentUser?.id && (
                            <button
                              onClick={async () => {
                                if (await confirm({ title: `Remove ${person.name}?`, message: `They will lose access to this workspace and all its projects.`, confirmText: 'Remove', variant: 'danger' })) {
                                  try {
                                    await api.delete(`/api/v1/workspaces/${workspaceId}/members/${person.id}`);
                                    dispatch(fetchWorkspace(workspaceId));
                                  } catch (err) {
                                    console.error('Failed to remove member:', err);
                                  }
                                }
                              }}
                              className="p-1.5 rounded-md text-[var(--karya-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove from workspace"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showInviteModal && (
        <InviteModal workspaceId={workspaceId} onClose={() => setShowInviteModal(false)} />
      )}
      {ConfirmDialog}

      {/* Toast notification for role change confirmation */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[300] animate-slide-in-right">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border ${
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-700/50'
              : 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-700/50'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              {toast.type === 'success' ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <p className={`text-sm font-semibold ${toast.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                {toast.type === 'success' ? 'Role Updated' : 'Failed'}
              </p>
              <p className={`text-xs ${toast.type === 'success' ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                {toast.message}
              </p>
            </div>
            <button onClick={() => setToast(null)} className="ml-2 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Workspace;
