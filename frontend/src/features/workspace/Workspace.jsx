import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchWorkspace, fetchInvites, resendInvite, cancelInvite, updateWorkspace } from '../../store/slices/workspaceSlice';
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

/**
 * Simple roles card for the workspace overview — flat list of all roles.
 * System roles (Editor/Commenter/Viewer) are read-only. Custom roles can be edited/deleted.
 * A "Create Role" button opens the permission modal for any selected project.
 */
function ProjectRolesCard({ workspaceId }) {
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
      <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Roles</h3>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-7 bg-gray-200 dark:bg-gray-700 rounded" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {/* System roles — read-only, no edit/delete */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-2">Default Roles</p>
              <div className="space-y-1.5">
                {uniqueSystem.map(role => (
                  <div key={role.name} className="flex items-center space-x-2.5 py-1.5 px-2 rounded-md">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${role.color}20`, color: role.color }}>
                      {role.name}
                    </span>
                    <span className="text-xs text-[var(--asana-text-secondary)]">
                      {role.name === 'Editor' ? 'Full edit access' : role.name === 'Commenter' ? 'View + comment only' : 'Read-only'}
                    </span>
                    <span className="text-[9px] text-[var(--asana-text-muted)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded ml-auto flex-shrink-0">
                      Default
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom roles — editable + deletable */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--asana-text-secondary)] mb-2">Custom Roles</p>
              {customRoles.length === 0 ? (
                <p className="text-xs text-[var(--asana-text-muted)] italic py-2">No custom roles yet. Create one below.</p>
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
                          className="p-1 rounded text-[var(--asana-text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-[var(--asana-text-primary)] transition-colors"
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
                          className="p-1 rounded text-[var(--asana-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
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
            <div className="pt-2 border-t border-[var(--asana-border)]">
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
                await api.put(`/api/v1/projects/roles/${roleId}`, { permissions });
                setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions } : r));
              }
            } catch (err) { console.error(err); }
            setCustomModalTarget(null);
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
      <div className="bg-[var(--asana-surface)] border-b border-[var(--asana-border)]">
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
      <div className="flex-1 overflow-y-auto bg-[var(--asana-bg)]">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          {/* Hero card */}
          <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] overflow-hidden">
            <div className="h-24 bg-gray-200 dark:bg-gray-700" />
            <div className="px-6 pb-6 -mt-8">
              <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 border-4 border-[var(--asana-surface)]" />
              <div className="h-5 w-56 bg-gray-200 dark:bg-gray-700 rounded mt-3" />
              <div className="h-3 w-72 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
            </div>
          </div>

          {/* Projects + sidebar grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {/* Projects card */}
            <div className="lg:col-span-2 bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
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
              <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
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
              <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
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

  // Track per-workspaceId readiness for both async dependencies so the page
  // shows a single skeleton until everything is loaded — no partial flashes.
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [invitesReady, setInvitesReady] = useState(false);

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
    return () => { cancelled = true; };
  }, [workspaceId, dispatch]);

  // The Workspace.members list and current-workspace identity must match the
  // requested URL — guards against the brief moment after navigation when
  // currentWorkspace still points at the previous workspace.
  const workspaceMatches = currentWorkspace?.id === workspaceId;
  const projectsMatch = projectsForWorkspaceId === workspaceId;
  const allReady = workspaceReady && invitesReady && workspaceMatches && projectsMatch;

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
  const isAdmin = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';

  if (!allReady) {
    return <WorkspaceSkeleton />;
  }

  if (!currentWorkspace) {
    return <div className="p-8 text-center text-[var(--asana-text-secondary)]">Workspace not found</div>;
  }

  const members = currentWorkspace.members?.map(m => ({
    id: m.user?.id || m.userId,
    name: m.user?.name,
    email: m.user?.email,
    avatar: m.user?.avatar,
    role: m.role,
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
      <div className="bg-[var(--asana-surface)] border-b border-[var(--asana-border)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-asana-coral to-[#e04030] flex items-center justify-center text-white font-bold text-sm">
                {currentWorkspace.name?.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-base font-bold text-[var(--asana-text-primary)]">{currentWorkspace.name}</h1>
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
                  className="asana-button-primary flex items-center text-xs px-3 py-1.5">
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
                  activeTab === tab.toLowerCase() ? 'text-asana-blue' : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
                }`}>
                {tab}
                {activeTab === tab.toLowerCase() && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto bg-[var(--asana-bg)]">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Team hero */}
              <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] overflow-hidden">
                <div className="h-24 bg-gradient-to-r from-gray-700 to-gray-900 dark:from-gray-800 dark:to-gray-950" />
                <div className="px-6 pb-6 -mt-8">
                  <div className="w-16 h-16 rounded-full bg-gray-400 dark:bg-gray-600 border-4 border-[var(--asana-surface)] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {currentWorkspace.name?.charAt(0).toUpperCase()}
                  </div>
                  <h2 className="text-xl font-bold text-[var(--asana-text-primary)] mt-3">{currentWorkspace.name}</h2>
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
                        className="w-full text-sm bg-[var(--asana-bg)] border border-[var(--asana-border)] rounded-md px-3 py-2 text-[var(--asana-text-primary)] placeholder-[var(--asana-text-muted)] outline-none focus:border-asana-blue resize-none disabled:opacity-50"
                      />
                      <div className="mt-2 flex items-center space-x-2">
                        <button
                          onClick={saveDescription}
                          disabled={savingDescription}
                          className="asana-button-primary text-xs px-3 py-1.5 inline-flex items-center disabled:opacity-50"
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
                          className="text-xs px-3 py-1.5 rounded text-[var(--asana-text-secondary)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <span className="text-[10px] text-[var(--asana-text-muted)]">⌘+Enter to save · Esc to cancel</span>
                      </div>
                    </div>
                  ) : (
                    <p
                      onClick={startEditingDescription}
                      className={`text-sm mt-1 ${currentWorkspace.description ? 'text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-muted)] italic'} ${isAdmin ? 'cursor-pointer hover:text-[var(--asana-text-primary)] transition-colors' : ''}`}
                      title={isAdmin ? 'Click to edit description' : undefined}
                    >
                      {currentWorkspace.description || (isAdmin ? 'Click to add team description...' : 'No description yet.')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                {/* Projects */}
                <div className="lg:col-span-2 bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Projects</h3>
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
                          <p className="text-sm font-medium text-[var(--asana-text-primary)] truncate">{p.name}</p>
                        </div>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)]">
                          {p.visibility?.toLowerCase()}
                        </span>
                      </Link>
                    )) : (
                      <p className="text-sm text-[var(--asana-text-secondary)] text-center py-6">No projects yet</p>
                    )}
                  </div>
                </div>

                {/* Right sidebar */}
                <div className="space-y-6">
                  {/* Members card */}
                  <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Members</h3>
                      <button onClick={() => setActiveTab('members')} className="text-[10px] text-asana-blue hover:underline">
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
                          className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-[var(--asana-text-secondary)] hover:border-asana-blue hover:text-asana-blue transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats card */}
                  <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                    <h3 className="text-sm font-bold text-[var(--asana-text-primary)] mb-3">Workspace stats</h3>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--asana-text-secondary)]">Projects</span>
                        <span className="text-xs font-bold text-[var(--asana-text-primary)]">{projects.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--asana-text-secondary)]">Members</span>
                        <span className="text-xs font-bold text-[var(--asana-text-primary)]">{members.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--asana-text-secondary)]">Pending invites</span>
                        <span className="text-xs font-bold text-[var(--asana-text-primary)]">{invites.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Invitations card — admin-only, dedicated section like the old layout */}
                  {isAdmin && invites.length > 0 && (
                    <div className="bg-[var(--asana-surface)] rounded-xl border border-[var(--asana-border)] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-[var(--asana-text-primary)]">Pending Invitations</h3>
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
                                <p className="text-xs font-medium text-[var(--asana-text-primary)] truncate">{inv.email}</p>
                                <p className="text-[10px] text-[var(--asana-text-secondary)]">
                                  {inv.role} · invited{inv.invitedBy ? ` by ${inv.invitedBy}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => dispatch(resendInvite(inv.id))}
                                className="p-1.5 rounded text-[var(--asana-text-secondary)] hover:bg-asana-blue/10 hover:text-asana-blue opacity-0 group-hover/inv:opacity-100 transition-all"
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
                                className="p-1.5 rounded text-[var(--asana-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover/inv:opacity-100 transition-all"
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
                  {isAdmin && <ProjectRolesCard workspaceId={workspaceId} />}
                </div>
              </div>
            </div>
          ) : (
            /* ── Members tab ── */
            <div className="bg-[var(--asana-surface)] border border-[var(--asana-border)] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--asana-border)] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--asana-text-primary)]">
                  Members & Invites
                  <span className="ml-2 text-xs font-medium text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {members.length + invites.length}
                  </span>
                </h2>
                {isAdmin && (
                  <button onClick={() => setShowInviteModal(true)}
                    className="asana-button-primary flex items-center text-xs px-3 py-1.5">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Invite
                  </button>
                )}
              </div>

              <div className="divide-y divide-[var(--asana-border)]">
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
                        <p className="text-sm font-medium text-[var(--asana-text-primary)]">
                          {person.name}
                          {person.id === currentUser?.id && (
                            <span className="ml-2 text-[10px] bg-asana-blue/10 text-asana-blue px-1.5 py-0.5 rounded-full font-bold">You</span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--asana-text-secondary)]">
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
                                className="p-1.5 rounded-md text-[var(--asana-text-secondary)] hover:bg-asana-blue/10 hover:text-asana-blue transition-colors"
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
                                className="p-1.5 rounded-md text-[var(--asana-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
                            <select
                              value={person.role}
                              onChange={async (e) => {
                                const newRole = e.target.value;
                                try {
                                  await api.put(`/api/v1/workspaces/${workspaceId}/members/${person.id}/role`, { userId: person.id, role: newRole });
                                  dispatch(fetchWorkspace(workspaceId));
                                } catch (err) {
                                  console.error('Failed to update role:', err);
                                }
                              }}
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--asana-surface)] border border-[var(--asana-border)] text-[var(--asana-text-primary)] cursor-pointer focus:outline-none focus:ring-1 focus:ring-asana-blue"
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="MEMBER">MEMBER</option>
                              <option value="GUEST">GUEST</option>
                            </select>
                          ) : (
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_STYLE[person.role] || ROLE_STYLE.MEMBER}`}>
                              {person.role}
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
                              className="p-1.5 rounded-md text-[var(--asana-text-secondary)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
    </div>
  );
}

export default Workspace;
