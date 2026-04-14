import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { emitToProject } from '../../core/socket.js';

// ── Permission helpers ───────────────────────────────────────────────────────

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

function canAccessProject(workspaceRole, projectVisibility, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (workspaceRole === 'MEMBER' && projectVisibility === 'PUBLIC') return true;
  return projectRole !== null;
}

function hasPermission(workspaceRole, projectRole, customPermissions, key) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (customPermissions && typeof customPermissions === 'object') return !!customPermissions[key];
  if (projectRole === 'EDITOR') return true;
  if (projectRole === 'COMMENTER' && (key === 'comment.create' || key === 'comment.delete' || key === 'time.track')) return true;
  return false;
}

// Resolve task context with permission data
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
  const customPermissions = projectMember?.customRole?.permissions ?? null;

  if (!canAccessProject(workspaceMember.role, project.visibility, projectRole)) {
    throw ApiError.forbidden('You do not have access to this task');
  }

  return { task, workspaceMember, projectRole, customPermissions, projectId: project.id };
}

// Recompute actualTime from all time entries
async function recomputeActualTime(taskId) {
  const result = await prisma.timeEntry.aggregate({
    where: { taskId },
    _sum: { minutes: true }
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { actualTime: result._sum.minutes || 0 }
  });
  return result._sum.minutes || 0;
}

export const timeTrackingService = {
  // Get all time entries for a task — any member with project access
  async getEntries(taskId, userId) {
    await getContextFromTask(taskId, userId); // access check
    return prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { date: 'desc' }
    });
  },

  // Add a manual time entry
  async addEntry(taskId, userId, data, excludeSocketId) {
    const { workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'time.track')) {
      throw ApiError.forbidden('You do not have permission to log time');
    }

    const { minutes, note, date } = data;
    const entry = await prisma.timeEntry.create({
      data: {
        minutes: parseInt(minutes),
        note: note || null,
        date: date ? new Date(date) : new Date(),
        taskId,
        userId,
      },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    const totalMinutes = await recomputeActualTime(taskId);
    emitToProject(projectId, 'time_entry_added', { taskId, entry, totalMinutes }, excludeSocketId);
    return { entry, totalMinutes };
  },

  // Update a time entry
  async updateEntry(entryId, userId, data, excludeSocketId) {
    const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw ApiError.notFound('Time entry not found');

    const { workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(entry.taskId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'time.track')) {
      throw ApiError.forbidden('You do not have permission to edit time entries');
    }

    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        ...(data.minutes !== undefined && { minutes: parseInt(data.minutes) }),
        ...(data.note !== undefined && { note: data.note }),
      },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    const totalMinutes = await recomputeActualTime(entry.taskId);
    emitToProject(projectId, 'time_entry_updated', { taskId: entry.taskId, entry: updated, totalMinutes }, excludeSocketId);
    return { entry: updated, totalMinutes };
  },

  // Delete a time entry
  async deleteEntry(entryId, userId, excludeSocketId) {
    const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw ApiError.notFound('Time entry not found');

    const { workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(entry.taskId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'time.track')) {
      throw ApiError.forbidden('You do not have permission to delete time entries');
    }

    await prisma.timeEntry.delete({ where: { id: entryId } });

    const totalMinutes = await recomputeActualTime(entry.taskId);
    emitToProject(projectId, 'time_entry_deleted', { taskId: entry.taskId, entryId, totalMinutes }, excludeSocketId);
    return { totalMinutes };
  },

  // Start timer on a task
  async startTimer(taskId, userId, excludeSocketId) {
    const { workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'time.track')) {
      throw ApiError.forbidden('You do not have permission to use the timer');
    }

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { timerStartedAt: true } });
    if (task.timerStartedAt) throw ApiError.badRequest('Timer is already running');

    await prisma.task.update({
      where: { id: taskId },
      data: { timerStartedAt: new Date(), timerStartedBy: userId }
    });

    emitToProject(projectId, 'timer_started', { taskId, startedAt: new Date().toISOString(), startedBy: userId }, excludeSocketId);
    return { startedAt: new Date() };
  },

  // Stop timer and create a time entry from elapsed time
  async stopTimer(taskId, userId, excludeSocketId) {
    const { workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'time.track')) {
      throw ApiError.forbidden('You do not have permission to use the timer');
    }

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { timerStartedAt: true } });
    if (!task.timerStartedAt) throw ApiError.badRequest('No timer running');

    const elapsed = Math.max(1, Math.round((Date.now() - new Date(task.timerStartedAt).getTime()) / 60000));

    // Clear timer
    await prisma.task.update({
      where: { id: taskId },
      data: { timerStartedAt: null, timerStartedBy: null }
    });

    // Create time entry from elapsed
    const entry = await prisma.timeEntry.create({
      data: {
        minutes: elapsed,
        note: 'Timer',
        date: new Date(),
        taskId,
        userId,
      },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    const totalMinutes = await recomputeActualTime(taskId);
    emitToProject(projectId, 'timer_stopped', { taskId, entry, totalMinutes }, excludeSocketId);
    return { entry, totalMinutes, elapsed };
  },

  // Get timer status for a task — any member with project access
  async getTimerStatus(taskId, userId) {
    await getContextFromTask(taskId, userId); // access check
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { timerStartedAt: true, timerStartedBy: true }
    });
    return { timerStartedAt: task?.timerStartedAt, timerStartedBy: task?.timerStartedBy };
  }
};

export default timeTrackingService;
