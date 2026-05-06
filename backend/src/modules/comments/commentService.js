import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { stripHtml } from '../../core/utils/sanitize.js';

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

function canAccessProject(workspaceRole, projectVisibility, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  // Public projects: any workspace member (MEMBER or GUEST) can view
  if (projectVisibility === 'PUBLIC') return true;
  // Private projects: must be an explicit project member
  return projectRole !== null;
}

function hasPermission(workspaceRole, projectRole, customPermissions, key) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (customPermissions && typeof customPermissions === 'object') return !!customPermissions[key];
  if (workspaceRole === 'MEMBER') return true;
  if (projectRole === 'EDITOR') return true;
  if (projectRole === 'COMMENTER' && (key === 'comment.create' || key === 'comment.delete' || key === 'time.track')) return true;
  return false;
}

async function getContextFromTask(taskId, userId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      list: {
        include: {
          board: {
            include: {
              project: {
                include: {
                  workspace: { include: { members: { where: { userId }, include: { customRole: { select: { permissions: true } } } } } },
                  members: { where: { userId }, include: { customRole: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!task) throw ApiError.notFound('Task not found');

  const project = task.list.board.project;
  const workspaceMember = project.workspace.members[0];
  if (!workspaceMember) throw ApiError.forbidden('You are not a member of this workspace');

  const projectMember = project.members[0] || null;
  const projectRole = projectMember?.projectRole ?? null;
  const customPermissions = projectMember?.customRole?.permissions ?? workspaceMember.customRole?.permissions ?? null;

  if (!canAccessProject(workspaceMember.role, project.visibility, projectRole)) {
    const canViewPrivate = !!(customPermissions?.['project.viewPrivate']);
    if (!canViewPrivate) throw ApiError.forbidden('You do not have access to this task');
  }

  return { task, workspaceMember, projectRole, customPermissions };
}

export const commentService = {
  // Create comment
  async create(taskId, userId, content) {
    const { task, workspaceMember, projectRole, customPermissions } = await getContextFromTask(taskId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'comment.create')) {
      throw ApiError.forbidden('You do not have permission to post comments');
    }

    const sanitized = stripHtml(content);
    if (!sanitized) throw ApiError.badRequest('Comment content cannot be empty');

    const comment = await prisma.comment.create({
      data: { content: sanitized, userId, taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    await prisma.activityLog.create({
      data: { action: 'COMMENT_ADDED', details: { commentId: comment.id }, userId, taskId }
    });

    return comment;
  },

  // Get comments — any member who can access the project
  async getByTask(taskId, userId) {
    await getContextFromTask(taskId, userId); // access check

    return prisma.comment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' }
    });
  },

  // Update comment — own comments only, must still have comment.create permission
  async update(commentId, userId, content) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw ApiError.notFound('Comment not found');
    if (comment.userId !== userId) throw ApiError.forbidden('You can only edit your own comments');

    const { workspaceMember, projectRole, customPermissions } = await getContextFromTask(comment.taskId, userId);
    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'comment.create')) {
      throw ApiError.forbidden('You do not have permission to post comments');
    }

    const sanitized = stripHtml(content);
    if (!sanitized) throw ApiError.badRequest('Comment content cannot be empty');

    return prisma.comment.update({ where: { id: commentId }, data: { content: sanitized } });
  },

  // Delete comment — own comments with comment.delete permission, or workspace Admin
  async delete(commentId, userId) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        task: {
          include: {
            list: {
              include: {
                board: {
                  include: {
                    project: {
                      include: {
                        workspace: { include: { members: { where: { userId }, include: { customRole: { select: { permissions: true } } } } } },
                        members: { where: { userId }, include: { customRole: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!comment) throw ApiError.notFound('Comment not found');

    const project = comment.task.list.board.project;
    const workspaceMember = project.workspace.members[0];
    const projectMember = project.members[0] || null;
    const projectRole = projectMember?.projectRole ?? null;
    const customPermissions = projectMember?.customRole?.permissions ?? workspaceMember.customRole?.permissions ?? null;

    const canDelete = hasPermission(workspaceMember?.role, projectRole, customPermissions, 'comment.delete');

    // Own comments: need comment.delete permission. Others' comments: workspace admin only.
    if (comment.userId === userId) {
      if (!canDelete) throw ApiError.forbidden('You do not have permission to delete comments');
    } else {
      if (!isWorkspaceAdmin(workspaceMember?.role)) throw ApiError.forbidden('You can only delete your own comments');
    }

    await prisma.comment.delete({ where: { id: commentId } });
    return true;
  }
};

export default commentService;
