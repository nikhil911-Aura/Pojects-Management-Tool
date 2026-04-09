import { useAppSelector } from '../store/hooks';

/**
 * Two-level role system with named reusable project roles.
 *
 * Each project has CustomProjectRole rows (3 system + any custom ones).
 * Each ProjectMember has a `customRole` FK pointing to one of these roles.
 * The role's `permissions` JSON object determines what the member can do.
 *
 * Workspace ADMIN/OWNER always bypass all project-level checks.
 */

export function useRole() {
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { currentProject }   = useAppSelector((state) => state.project);
  const { user }             = useAppSelector((state) => state.auth);

  const workspaceRole = currentWorkspace?.role ?? null;
  const isWorkspaceAdmin = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
  const isGuest = workspaceRole === 'GUEST';

  // Find the current user's project membership
  const projectMember = currentProject?.members?.find((m) => m.userId === user?.id);

  // Read the named role from the new customRole FK (preferred),
  // falling back to the legacy projectRole enum for un-migrated data.
  const customRole = projectMember?.customRole ?? null;      // { id, name, permissions, isSystem, color, ... }
  const legacyRole = projectMember?.projectRole ?? null;     // 'EDITOR' | 'COMMENTER' | 'VIEWER' | 'CUSTOM' | null

  // Resolve the effective permission map.
  // Priority: workspace admin → customRole.permissions → legacy enum fallback.
  let perms = {};
  if (isWorkspaceAdmin) {
    // Admin gets everything — no need to resolve
    perms = new Proxy({}, { get: () => true });
  } else if (customRole?.permissions && typeof customRole.permissions === 'object') {
    perms = customRole.permissions;
  } else {
    // Legacy fallback for un-migrated members
    switch (legacyRole) {
      case 'EDITOR':
        perms = new Proxy({}, { get: () => true });
        break;
      case 'COMMENTER':
        perms = { 'comment.create': true, 'comment.delete': true, 'time.track': true };
        break;
      default:
        perms = {};
    }
  }

  // Granular permission checker
  const can = (key) => !!perms[key];

  // The role name to display in the UI (badge text)
  const roleName = isWorkspaceAdmin
    ? 'Editor'
    : (customRole?.name || legacyRole || null);

  const roleColor = customRole?.color || null;

  const projectVisibility = currentProject?.visibility ?? null;
  const canView = isWorkspaceAdmin
    || customRole !== null
    || legacyRole !== null
    || (workspaceRole === 'MEMBER' && projectVisibility === 'PUBLIC');

  return {
    workspaceRole,
    projectRole: legacyRole,       // backward compat
    customRole,                    // full role object for display
    roleName,                      // "Editor", "QA Tester", etc.
    roleColor,                     // badge color
    isWorkspaceAdmin,
    isGuest,

    // Granular: can('task.delete'), can('project.invite'), etc.
    can,

    // Convenience aliases (backward compatible)
    canEdit:    can('task.edit'),
    canComment: can('comment.create'),
    canView,

    // Workspace-scoped
    canManageWorkspace: isWorkspaceAdmin,
    canCreateProject:   workspaceRole !== null,
  };
}

export default useRole;
