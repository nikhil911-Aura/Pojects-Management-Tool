import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const activityService = {

  // Get count of inbox items (assignments) newer than lastInboxSeenAt
  async getUnreadCount(workspaceId, userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
      select: { lastInboxSeenAt: true },
    });
    if (!membership) return 0;

    const where = {
      userId,
      task: { list: { board: { project: { workspaceId } } } },
    };

    // Only count assignments newer than last seen
    if (membership.lastInboxSeenAt) {
      where.createdAt = { gt: membership.lastInboxSeenAt };
    }

    // Filter to primary assignee only (same logic as inbox)
    const assignments = await prisma.taskAssignee.findMany({
      where,
      select: {
        createdAt: true,
        task: {
          select: {
            assignees: { select: { userId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
          },
        },
      },
    });

    return assignments.filter(a => a.task.assignees?.[0]?.userId === userId).length;
  },

  // Mark inbox as seen — sets lastInboxSeenAt to now
  async markInboxSeen(workspaceId, userId) {
    await prisma.workspaceMember.updateMany({
      where: { workspaceId, userId },
      data: { lastInboxSeenAt: new Date() },
    });
  },

  // Inbox — shows tasks recently assigned to the current user (newest first).
  // Only the user's OWN assigned tasks — sorted by when they were assigned.
  async getInbox(workspaceId, userId, { cursor, limit = 30 } = {}) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
    });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const where = {
      userId,
      task: {
        list: { board: { project: { workspaceId } } },
      },
    };

    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    // Get task assignments for this user, newest first
    const assignments = await prisma.taskAssignee.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            assignees: {
              select: { userId: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
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
    });

    // Only keep tasks where this user is the PRIMARY assignee (first assigned)
    const filtered = assignments.filter(a => a.task.assignees?.[0]?.userId === userId);

    const paginated = filtered.slice(0, limit + 1);
    const hasMore = paginated.length > limit;
    const items = hasMore ? paginated.slice(0, limit) : paginated;
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
