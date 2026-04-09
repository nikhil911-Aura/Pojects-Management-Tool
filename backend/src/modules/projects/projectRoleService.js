import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { PROJECT_PERMISSION_KEYS } from '../../core/utils/projectPermissions.js';
import { emitToWorkspace } from '../../core/socket.js';

// Permission presets for the 3 system roles
const ALL_PERMS = Object.fromEntries(PROJECT_PERMISSION_KEYS.map(p => [p.key, true]));
const COMMENTER_PERMS = { 'comment.create': true, 'comment.delete': true, 'time.track': true };
const VIEWER_PERMS = {};

export const SYSTEM_ROLE_DEFS = [
  { name: 'Editor',    color: '#3B82F6', permissions: ALL_PERMS,       position: 0 },
  { name: 'Commenter', color: '#F59E0B', permissions: COMMENTER_PERMS, position: 1 },
  { name: 'Viewer',    color: '#6B7280', permissions: VIEWER_PERMS,    position: 2 },
];

const projectRoleService = {
  /**
   * Seed the 3 system roles for a workspace. Called on workspace creation
   * or on first project creation if the workspace has no roles yet.
   * Returns { Editor: id, Commenter: id, Viewer: id }.
   */
  async seedSystemRoles(workspaceId) {
    const map = {};
    for (const def of SYSTEM_ROLE_DEFS) {
      const role = await prisma.customProjectRole.upsert({
        where: { workspaceId_name: { workspaceId, name: def.name } },
        create: {
          name: def.name,
          color: def.color,
          isSystem: true,
          permissions: def.permissions,
          position: def.position,
          workspaceId,
        },
        update: {},
      });
      map[def.name] = role.id;
    }
    return map;
  },

  /**
   * Get all roles for a workspace (system + custom), ordered by position.
   */
  async getRoles(workspaceId) {
    return prisma.customProjectRole.findMany({
      where: { workspaceId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  },

  /**
   * Create a new custom role in a workspace.
   */
  async createRole(workspaceId, userId, data) {
    await this._checkAdmin(workspaceId, userId);
    const { name, description, color, permissions } = data;
    if (!name?.trim()) throw ApiError.badRequest('Role name is required');

    const maxPos = await prisma.customProjectRole.aggregate({
      where: { workspaceId },
      _max: { position: true },
    });

    return prisma.customProjectRole.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#8B5CF6',
        isSystem: false,
        permissions: permissions || {},
        position: (maxPos._max.position ?? 0) + 1,
        workspaceId,
      },
    });
  },

  /**
   * Update a role's name, description, color, or permissions.
   * System roles: can change permissions but not name.
   */
  async updateRole(roleId, userId, data) {
    const role = await prisma.customProjectRole.findUnique({ where: { id: roleId } });
    if (!role) throw ApiError.notFound('Role not found');
    await this._checkAdmin(role.workspaceId, userId);

    const update = {};
    if (data.permissions !== undefined) update.permissions = data.permissions;
    if (data.color) update.color = data.color;
    if (data.description !== undefined) update.description = data.description?.trim() || null;
    if (data.name && !role.isSystem) update.name = data.name.trim();
    if (role.isSystem && data.name && data.name.trim() !== role.name) {
      throw ApiError.badRequest('Cannot rename a system role');
    }

    const updated = await prisma.customProjectRole.update({
      where: { id: roleId },
      data: update,
    });

    // Broadcast to all clients in the workspace so permissions update live.
    emitToWorkspace(role.workspaceId, 'project_role_updated', {
      roleId: updated.id,
      permissions: updated.permissions,
      name: updated.name,
      color: updated.color,
    });

    return updated;
  },

  /**
   * Delete a custom role. System roles cannot be deleted.
   * Members using this role are reassigned to the Viewer system role.
   */
  async deleteRole(roleId, userId) {
    const role = await prisma.customProjectRole.findUnique({ where: { id: roleId } });
    if (!role) throw ApiError.notFound('Role not found');
    if (role.isSystem) throw ApiError.badRequest('Cannot delete a system role');
    await this._checkAdmin(role.workspaceId, userId);

    // Reassign members to Viewer
    const viewerRole = await prisma.customProjectRole.findFirst({
      where: { workspaceId: role.workspaceId, isSystem: true, name: 'Viewer' },
    });
    if (viewerRole) {
      await prisma.projectMember.updateMany({
        where: { projectRoleId: roleId },
        data: { projectRoleId: viewerRole.id },
      });
    }

    await prisma.customProjectRole.delete({ where: { id: roleId } });

    // Broadcast: affected members' roles changed to Viewer
    emitToWorkspace(role.workspaceId, 'project_role_deleted', {
      roleId,
      reassignedToRoleId: viewerRole?.id || null,
      viewerRole: viewerRole || null,
    });

    return { message: 'Role deleted' };
  },

  // Verify the caller is a workspace OWNER or ADMIN
  async _checkAdmin(workspaceId, userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, role: { in: ['OWNER', 'ADMIN'] } },
    });
    if (!membership) throw ApiError.forbidden('You need Admin access to manage roles');
  },
};

export default projectRoleService;
