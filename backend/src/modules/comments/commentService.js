import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

function canAccessProject(workspaceRole, projectVisibility, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (workspaceRole === 'MEMBER' && projectVisibility === 'PUBLIC') return true;
  return projectRole !== null;
}

// Commenters and Editors can post comments; Viewers cannot
function canCommentProject(workspaceRole, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  return projectRole === 'EDITOR' || projectRole === 'COMMENTER';
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
                  workspace: { include: { members: { where: { userId } } } },
                  members: { where: { userId } }
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

  if (!canAccessProject(workspaceMember.role, project.visibility, projectRole)) {
    throw ApiError.forbidden('You do not have access to this task');
  }

  return { task, workspaceMember, projectRole };
}

export const commentService = {
  // Create comment — EDITOR or COMMENTER (not VIEWER)
  async create(taskId, userId, content) {
    const { task, workspaceMember, projectRole } = await getContextFromTask(taskId, userId);

    if (!canCommentProject(workspaceMember.role, projectRole)) {
      throw ApiError.forbidden('You need at least Commenter access to post comments');
    }

    const comment = await prisma.comment.create({
      data: { content, userId, taskId },
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

  // Update comment — own comments only (must have at least COMMENTER access)
  async update(commentId, userId, content) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw ApiError.notFound('Comment not found');
    if (comment.userId !== userId) throw ApiError.forbidden('You can only edit your own comments');

    return prisma.comment.update({ where: { id: commentId }, data: { content } });
  },

  // Delete comment — own comments only, or workspace Admin
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
                        workspace: { include: { members: { where: { userId } } } }
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

    const workspaceMember = comment.task.list.board.project.workspace.members[0];
    const isAdmin = workspaceMember && isWorkspaceAdmin(workspaceMember.role);

    if (comment.userId !== userId && !isAdmin) {
      throw ApiError.forbidden('You can only delete your own comments');
    }

    await prisma.comment.delete({ where: { id: commentId } });
    return true;
  }
};

export default commentService;
