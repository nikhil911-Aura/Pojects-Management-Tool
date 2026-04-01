import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const activityService = {
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
