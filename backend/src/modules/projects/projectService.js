import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { emitToWorkspace, emitToProject } from '../../core/socket.js';
import { cloudinary } from '../../core/cloudinary.js';
import projectRoleService from './projectRoleService.js';

// ── Permission helpers ───────────────────────────────────────────────────────

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

function hasPermission(workspaceRole, projectRole, customPermissions, key) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (projectRole === 'EDITOR') return true;
  if (projectRole === 'CUSTOM' && customPermissions) return !!customPermissions[key];
  return false;
}

// Get workspace + project role for a user in a project
async function getProjectPermissionContext(projectId, userId) {
  const wsMember = await prisma.workspaceMember.findFirst({
    where: { workspace: { projects: { some: { id: projectId } } }, userId }
  });
  if (!wsMember) return { wsRole: null, projectRole: null, customPermissions: null };

  const projMember = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    include: { customRole: true }
  });

  return {
    wsRole: wsMember.role,
    projectRole: projMember?.projectRole ?? null,
    customPermissions: projMember?.customRole?.permissions ?? null
  };
}

export const projectService = {
  // Create project
  async create(workspaceId, userId, projectData, excludeSocketId) {
    const { name, description, icon, color, visibility, views } = projectData;

    // Check workspace membership — all roles can create projects (like real Asana)
    // Guests are forced to PRIVATE visibility
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to create projects in this workspace');
    }

    // Guests can only create Private projects
    const isGuest = membership.role === 'GUEST';
    if (isGuest && visibility && visibility !== 'PRIVATE') {
      throw ApiError.forbidden('Guests can only create private projects');
    }

    // Create project with board and default list
    const project = await prisma.project.create({
      data: {
        name,
        description,
        icon,
        color,
        views: views?.length > 0 ? views : ['overview', 'list', 'board', 'timeline', 'dashboard'],
        visibility: visibility || 'PRIVATE',
        workspaceId,
        createdById: userId,
        board: {
          create: {
            name: 'Board',
            lists: {
              create: {
                name: 'To do',
                position: 0,
              }
            }
          }
        },
        members: {
          create: {
            userId,
            role: membership.role,
            projectRole: 'EDITOR',
          }
        }
      },
      include: {
        board: {
          include: {
            lists: true
          }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        workspace: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Ensure the workspace has system roles (Editor / Commenter / Viewer).
    // seedSystemRoles is idempotent — only creates if missing.
    const roleMap = await projectRoleService.seedSystemRoles(workspaceId);
    // Assign the project creator to the Editor role.
    await prisma.projectMember.updateMany({
      where: { projectId: project.id, userId },
      data: { projectRoleId: roleMap['Editor'] },
    });

    emitToWorkspace(workspaceId, 'project_created', { project }, excludeSocketId);
    return project;
  },

  // Get all projects in workspace
  async getAll(workspaceId, userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have access to this workspace');
    }

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

    const projects = await prisma.project.findMany({
      where: {
        workspaceId,
        // Admins/Owners see all projects
        // Members see: PUBLIC projects + PRIVATE projects they're explicitly in
        // Guests see: ONLY projects they're explicitly in (regardless of visibility)
        ...(!isAdmin && {
          OR: [
            ...(membership.role === 'MEMBER' ? [{ visibility: 'PUBLIC' }] : []),
            { members: { some: { userId } } }
          ]
        })
      },
      include: {
        board: {
          select: { id: true }
        },
        workspace: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true }
            }
          }
        },
        _count: { select: { members: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Compute lightweight stats per project (replaces fetching all tasks)
    const projectIds = projects.map(p => p.id);
    const boardIds = projects.map(p => p.board?.id).filter(Boolean);

    // Batch count queries — single DB call for all projects
    const [sectionCounts, taskStats] = await Promise.all([
      // Count sections (lists) per board
      boardIds.length ? prisma.list.groupBy({
        by: ['boardId'],
        where: { boardId: { in: boardIds } },
        _count: true
      }) : [],
      // Count tasks by type per board (via list relation)
      boardIds.length ? prisma.task.groupBy({
        by: ['listId'],
        where: { list: { boardId: { in: boardIds } } },
        _count: true
      }).then(async () => {
        // Get task stats in one raw-ish query via aggregation
        return prisma.task.findMany({
          where: { list: { boardId: { in: boardIds } } },
          select: {
            taskType: true,
            parentId: true,
            list: { select: { boardId: true } }
          }
        });
      }) : []
    ]);

    // Build stats lookup by boardId
    const sectionCountMap = {};
    (Array.isArray(sectionCounts) ? sectionCounts : []).forEach(s => {
      sectionCountMap[s.boardId] = s._count;
    });

    const taskStatsMap = {};
    (Array.isArray(taskStats) ? taskStats : []).forEach(t => {
      const bid = t.list?.boardId;
      if (!bid) return;
      if (!taskStatsMap[bid]) taskStatsMap[bid] = { tasks: 0, milestones: 0, subtasks: 0, total: 0 };
      taskStatsMap[bid].total++;
      if (t.parentId) { taskStatsMap[bid].subtasks++; }
      else if (t.taskType === 'MILESTONE') { taskStatsMap[bid].milestones++; }
      else { taskStatsMap[bid].tasks++; }
    });

    // Attach stats to each project (flat structure for frontend)
    return projects.map(p => {
      const bid = p.board?.id;
      const stats = taskStatsMap[bid] || { tasks: 0, milestones: 0, subtasks: 0, total: 0 };
      return {
        ...p,
        stats: {
          sections: sectionCountMap[bid] || 0,
          ...stats
        }
      };
    });
  },

  // Get project by ID
  async getById(projectId, userId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        board: {
          select: { id: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            members: {
              where: { userId },
              select: { role: true },
              take: 1
            }
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            },
            customRole: true
          }
        }
      }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check workspace membership (fetched inline — no extra DB call)
    const membership = project.workspace.members?.[0];

    if (!membership) {
      throw ApiError.forbidden('You do not have access to this project');
    }

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

    if (!isAdmin) {
      const isProjectMember = project.members.some(m => m.userId === userId);
      const isPublicForMember = membership.role === 'MEMBER' && project.visibility === 'PUBLIC';

      if (!isProjectMember && !isPublicForMember) {
        throw ApiError.forbidden('You do not have access to this project');
      }
    }

    // Strip internal workspace.members from response (only needed for auth check)
    const { members: _wm, ...workspaceData } = project.workspace;
    return { ...project, workspace: workspaceData };
  },

  // Update project
  async update(projectId, userId, updateData, excludeSocketId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const { wsRole, projectRole, customPermissions } = await getProjectPermissionContext(projectId, userId);
    if (!hasPermission(wsRole, projectRole, customPermissions, 'project.edit')) {
      throw ApiError.forbidden('You do not have permission to update this project');
    }

    const { name, description, icon, color, visibility } = updateData;

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(visibility && { visibility })
      },
      include: {
        board: true,
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } }
          }
        },
        workspace: { select: { id: true, name: true } }
      }
    });

    emitToWorkspace(project.workspaceId, 'project_updated', { project: updated }, excludeSocketId);
    emitToProject(projectId, 'project_settings_changed', { project: updated }, excludeSocketId);
    return updated;
  },

  // Delete project
  async delete(projectId, userId, excludeSocketId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const { wsRole, projectRole, customPermissions } = await getProjectPermissionContext(projectId, userId);
    if (!hasPermission(wsRole, projectRole, customPermissions, 'project.delete')) {
      throw ApiError.forbidden('You do not have permission to delete this project');
    }

    // Clean up ALL Cloudinary files for every task in this project before cascade delete.
    // Project → Board → Lists → Tasks → Attachments. One bulk query + one bulk CDN call.
    const attachments = await prisma.attachment.findMany({
      where: { task: { list: { board: { project: { id: projectId } } } } },
      select: { publicId: true, url: true },
    });
    if (attachments.length > 0) {
      const extractPublicId = (url) => {
        try { const m = url?.match(/\/upload\/(?:v\d+\/)?(.*?)(?:\.[a-zA-Z0-9]+)?$/); return m?.[1] || null; } catch { return null; }
      };
      const publicIds = attachments
        .map(a => a.publicId || extractPublicId(a.url))
        .filter(Boolean);
      if (publicIds.length > 0) {
        // Cloudinary bulk delete supports up to 100 at a time
        for (let i = 0; i < publicIds.length; i += 100) {
          const batch = publicIds.slice(i, i + 100);
          cloudinary.api.delete_resources(batch, { resource_type: 'image' })
            .catch(err => console.warn('[delete project] Cloudinary cleanup failed (non-fatal):', err.message));
        }
      }
    }

    await prisma.project.delete({
      where: { id: projectId }
    });

    emitToWorkspace(project.workspaceId, 'project_deleted', { projectId }, excludeSocketId);
    emitToProject(projectId, 'project_deleted', { projectId }, excludeSocketId);
    return true;
  },

  // Add member to project
  async addMember(projectId, userId, memberData, excludeSocketId) {
    const { userId: newMemberId, role = 'MEMBER', projectRole = 'EDITOR' } = memberData;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check permission
    const { wsRole, projectRole: callerProjRole, customPermissions } = await getProjectPermissionContext(projectId, userId);
    if (!hasPermission(wsRole, callerProjRole, customPermissions, 'project.invite')) {
      throw ApiError.forbidden('You do not have permission to add members');
    }

    // Check if already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: newMemberId,
          projectId
        }
      }
    });

    if (existingMember) {
      throw ApiError.conflict('User is already a member of this project');
    }

    // Resolve the projectRoleId from the workspace's role pool.
    // Accepts either `roleId` (new) or `projectRole` string (legacy compat).
    let projectRoleId = memberData.roleId || null;
    if (!projectRoleId && projectRole) {
      const nameMap = { EDITOR: 'Editor', COMMENTER: 'Commenter', VIEWER: 'Viewer' };
      const roleName = nameMap[projectRole] || 'Editor';
      const systemRole = await prisma.customProjectRole.findFirst({
        where: { workspaceId: project.workspaceId, isSystem: true, name: roleName },
      });
      if (systemRole) projectRoleId = systemRole.id;
    }

    const member = await prisma.projectMember.create({
      data: {
        userId: newMemberId,
        projectId,
        role,
        projectRole,
        ...(projectRoleId && { projectRoleId }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        customRole: true
      }
    });

    emitToProject(projectId, 'member_added', { member, projectId }, excludeSocketId);

    // Also emit to the WORKSPACE room so the newly-invited user (who isn't in
    // the project room yet) gets notified. Their sidebar can then add the project
    // to their project list without a full reload. This is critical for private
    // projects which aren't visible until the user is a member.
    emitToWorkspace(project.workspaceId, 'project_member_added', {
      projectId,
      userId: newMemberId,
      project: {
        id: project.id,
        name: project.name,
        color: project.color,
        visibility: project.visibility,
        description: project.description,
        workspaceId: project.workspaceId,
      },
    });

    return member;
  },

  // Remove member from project
  async removeMember(projectId, userId, memberIdToRemove, excludeSocketId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check permission
    const { wsRole, projectRole: callerProjRole, customPermissions } = await getProjectPermissionContext(projectId, userId);
    if (!hasPermission(wsRole, callerProjRole, customPermissions, 'project.invite')) {
      throw ApiError.forbidden('You do not have permission to remove members');
    }

    // Cannot remove yourself
    if (memberIdToRemove === userId) {
      throw ApiError.forbidden('You cannot remove yourself from the project');
    }

    // Only workspace OWNER/ADMIN can remove the project creator
    if (project.createdById && memberIdToRemove === project.createdById && !isWorkspaceAdmin(wsRole)) {
      throw ApiError.forbidden('Cannot remove the project creator');
    }

    // Protect workspace OWNER/ADMIN — only the OWNER can remove another OWNER or an ADMIN
    const targetWsMembership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: memberIdToRemove },
      select: { role: true },
    });
    if (targetWsMembership) {
      if (targetWsMembership.role === 'OWNER' && wsRole !== 'OWNER') {
        throw ApiError.forbidden('You cannot remove the workspace owner');
      }
      if (targetWsMembership.role === 'ADMIN' && wsRole !== 'OWNER') {
        throw ApiError.forbidden('Only the workspace owner can remove an admin');
      }
    }

    await prisma.projectMember.delete({
      where: {
        userId_projectId: {
          userId: memberIdToRemove,
          projectId
        }
      }
    });

    emitToProject(projectId, 'member_removed', { userId: memberIdToRemove, projectId }, excludeSocketId);

    // Also emit to workspace room so the removed user's sidebar updates
    // (they lose access to a private project → it should disappear).
    emitToWorkspace(project.workspaceId, 'project_member_removed', {
      projectId,
      userId: memberIdToRemove,
    });

    return true;
  },

  // Update a project member's role — accepts a roleId pointing to a CustomProjectRole.
  // Also supports legacy `projectRole` string for backward compat (maps to system role).
  async updateMemberRole(projectId, userId, memberData, excludeSocketId) {
    const { userId: targetUserId, projectRole, roleId, customPermissions } = memberData;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw ApiError.notFound('Project not found');

    const { wsRole, projectRole: callerProjRole, customPermissions: callerPerms } = await getProjectPermissionContext(projectId, userId);

    // Permission gate: needs the dedicated `project.changeRole` permission.
    // Workspace OWNER/ADMIN bypass via hasPermission().
    if (!hasPermission(wsRole, callerProjRole, callerPerms, 'project.changeRole')) {
      throw ApiError.forbidden('You do not have permission to change project roles');
    }

    // Cannot change your own role — except workspace OWNER/ADMIN can change their own project role
    if (targetUserId === userId && !isWorkspaceAdmin(wsRole)) {
      throw ApiError.forbidden('You cannot change your own role');
    }

    // Protect workspace OWNER and ADMIN — only the OWNER can change another OWNER/ADMIN's role.
    // (In practice "change OWNER" is impossible because OWNER bypasses everything anyway,
    // but we still block lower-privilege users from changing ADMIN roles.)
    const targetWsMembership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId: targetUserId },
      select: { role: true },
    });
    if (targetWsMembership) {
      const targetIsOwner = targetWsMembership.role === 'OWNER';
      const targetIsAdmin = targetWsMembership.role === 'ADMIN';
      if (targetIsOwner && wsRole !== 'OWNER') {
        throw ApiError.forbidden("You cannot change the workspace owner's role");
      }
      if (targetIsAdmin && wsRole !== 'OWNER') {
        throw ApiError.forbidden("Only the workspace owner can change an admin's role");
      }
    }

    let targetRoleId = roleId;

    // If caller sent `projectRole` string instead of `roleId`, resolve it to the system role.
    if (!targetRoleId && projectRole) {
      const nameMap = { EDITOR: 'Editor', COMMENTER: 'Commenter', VIEWER: 'Viewer' };
      const roleName = nameMap[projectRole];
      if (roleName) {
        const systemRole = await prisma.customProjectRole.findFirst({
          where: { workspaceId: project.workspaceId, isSystem: true, name: roleName },
        });
        if (systemRole) targetRoleId = systemRole.id;
      }
    }

    if (!targetRoleId) throw ApiError.badRequest('Invalid role');

    // If updating permissions for the target role itself (custom role editor)
    if (customPermissions) {
      await prisma.customProjectRole.update({
        where: { id: targetRoleId },
        data: { permissions: customPermissions },
      });
    }

    const updated = await prisma.projectMember.update({
      where: { userId_projectId: { userId: targetUserId, projectId } },
      data: { projectRoleId: targetRoleId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        customRole: true,
      },
    });

    emitToProject(projectId, 'member_role_changed', { member: updated, projectId }, excludeSocketId);
    return updated;
  }
};

export default projectService;
