import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const activityService = {

  // Get inbox — activity logs relevant to the user across all projects in a workspace.
  // Shows: actions on tasks assigned to user, tasks user created, comments on user's tasks,
  // and actions done by others (not the user's own actions).
  async getInbox(workspaceId, userId, { cursor, limit = 30 } = {}) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

    // Build where: activities on tasks in this workspace, NOT by the current user
    const where = {
      userId: { not: userId }, // exclude own actions
      task: {
        list: { board: { project: { workspaceId } } },
      },
    };

    // Non-admins: only see activities on tasks they're assigned to or created
    if (!isAdmin) {
      where.task.OR = [
        { assignees: { some: { userId } } },
        { activityLogs: { some: { userId, action: { in: ['TASK_CREATED', 'SUBTASK_CREATED'] } } } },
      ];
    }

    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const activities = await prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            list: {
              select: {
                name: true,
                board: {
                  select: {
                    projectId: true,
                    project: { select: { id: true, name: true, color: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // fetch one extra to detect if there's a next page
    });

    const hasMore = activities.length > limit;
    const items = hasMore ? activities.slice(0, limit) : activities;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor, hasMore };
  },

  // Get activity logs for task
  async getByTask(taskId, userId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          include: {
            board: {
              include: {
                project: {
                  include: {
                    workspace: {
                      include: {
                        members: true
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

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    const membership = task.list.board.project.workspace.members.find(m => m.userId === userId);
    if (!membership) {
      throw ApiError.forbidden('You do not have access to this task');
    }

    const activities = await prisma.activityLog.findMany({
      where: { taskId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return activities;
  }
};

export default activityService;
