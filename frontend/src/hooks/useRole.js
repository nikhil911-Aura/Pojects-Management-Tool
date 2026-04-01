import { useAppSelector } from '../store/hooks';

/**
 * Asana-style two-level role system.
 *
 * ── Workspace level ──────────────────────────────────────────────────────────
 *   ADMIN / OWNER  →  full control; bypasses all project-level restrictions
 *   MEMBER         →  governed by their ProjectRole within each project
 *   GUEST          →  external user; can ONLY see projects they're added to
 *
 * ── Project level ────────────────────────────────────────────────────────────
 *   EDITOR         →  full read / write / manage within the project
 *   COMMENTER      →  view + comment; cannot edit tasks or sections
 *   VIEWER         →  read-only; cannot comment or edit
 *
 * ── Returned values ──────────────────────────────────────────────────────────
 *   workspaceRole       — 'ADMIN' | 'MEMBER' | 'GUEST' | 'OWNER' | null
 *   projectRole         — 'EDITOR' | 'COMMENTER' | 'VIEWER' | null
 *   isWorkspaceAdmin    — OWNER or ADMIN (bypasses all project checks)
 *   isGuest             — workspace GUEST
 *   canEdit             — can create/edit/delete tasks and sections
 *   canComment          — can post comments (EDITOR or COMMENTER)
 *   canView             — can view the project at all
 *   canManageWorkspace  — can manage workspace members / settings
 *   canCreateProject    — can create new projects (all workspace members including guests)
 */
export function useRole() {
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { currentProject }   = useAppSelector((state) => state.project);
  const { user }             = useAppSelector((state) => state.auth);

  // workspaceService.getById() attaches `role` at the top level of the workspace object
  const workspaceRole = currentWorkspace?.role ?? null;
  const isWorkspaceAdmin = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
  const isGuest = workspaceRole === 'GUEST';

  // Find the current user's project membership
  const projectMember = currentProject?.members?.find((m) => m.userId === user?.id);

  // Workspace admins are always effectively Editors within any project
  const projectRole = isWorkspaceAdmin
    ? 'EDITOR'
    : (projectMember?.projectRole ?? null);

  // Project visibility affects whether a non-member MEMBER can view the project
  const projectVisibility = currentProject?.visibility ?? null;
  const canView = isWorkspaceAdmin
    || projectRole !== null
    || (workspaceRole === 'MEMBER' && projectVisibility === 'PUBLIC');

  return {
    workspaceRole,
    projectRole,
    isWorkspaceAdmin,
    isGuest,

    // Project-scoped permissions
    canEdit:    isWorkspaceAdmin || projectRole === 'EDITOR',
    canComment: isWorkspaceAdmin || projectRole === 'EDITOR' || projectRole === 'COMMENTER',
    canView,

    // Workspace-scoped permissions
    canManageWorkspace: isWorkspaceAdmin,
    canCreateProject:   workspaceRole !== null, // all workspace members including guests (guests can only create Private)
  };
}

export default useRole;
