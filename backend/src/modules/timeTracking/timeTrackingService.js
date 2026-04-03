import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { emitToProject } from '../../core/socket.js';

// Helper to get projectId from taskId
async function getProjectId(taskId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { list: { select: { board: { select: { projectId: true } } } } }
  });
  return task?.list?.board?.projectId;
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
  // Get all time entries for a task
  async getEntries(taskId) {
    return prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { date: 'desc' }
    });
  },

  // Add a manual time entry
  async addEntry(taskId, userId, data, excludeSocketId) {
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
    const projectId = await getProjectId(taskId);
    if (projectId) {
      emitToProject(projectId, 'time_entry_added', { taskId, entry, totalMinutes }, excludeSocketId);
    }
    return { entry, totalMinutes };
  },

  // Update a time entry
  async updateEntry(entryId, userId, data, excludeSocketId) {
    const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw ApiError.notFound('Time entry not found');

    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        ...(data.minutes !== undefined && { minutes: parseInt(data.minutes) }),
        ...(data.note !== undefined && { note: data.note }),
      },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    const totalMinutes = await recomputeActualTime(entry.taskId);
    const projectId = await getProjectId(entry.taskId);
    if (projectId) {
      emitToProject(projectId, 'time_entry_updated', { taskId: entry.taskId, entry: updated, totalMinutes }, excludeSocketId);
    }
    return { entry: updated, totalMinutes };
  },

  // Delete a time entry
  async deleteEntry(entryId, userId, excludeSocketId) {
    const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw ApiError.notFound('Time entry not found');

    await prisma.timeEntry.delete({ where: { id: entryId } });

    const totalMinutes = await recomputeActualTime(entry.taskId);
    const projectId = await getProjectId(entry.taskId);
    if (projectId) {
      emitToProject(projectId, 'time_entry_deleted', { taskId: entry.taskId, entryId, totalMinutes }, excludeSocketId);
    }
    return { totalMinutes };
  },

  // Start timer on a task
  async startTimer(taskId, userId, excludeSocketId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw ApiError.notFound('Task not found');
    if (task.timerStartedAt) throw ApiError.badRequest('Timer is already running');

    await prisma.task.update({
      where: { id: taskId },
      data: { timerStartedAt: new Date(), timerStartedBy: userId }
    });

    const projectId = await getProjectId(taskId);
    if (projectId) {
      emitToProject(projectId, 'timer_started', { taskId, startedAt: new Date().toISOString(), startedBy: userId }, excludeSocketId);
    }
    return { startedAt: new Date() };
  },

  // Stop timer and create a time entry from elapsed time
  async stopTimer(taskId, userId, excludeSocketId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw ApiError.notFound('Task not found');
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
    const projectId = await getProjectId(taskId);
    if (projectId) {
      emitToProject(projectId, 'timer_stopped', { taskId, entry, totalMinutes }, excludeSocketId);
    }
    return { entry, totalMinutes, elapsed };
  },

  // Get timer status for a task
  async getTimerStatus(taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { timerStartedAt: true, timerStartedBy: true }
    });
    return { timerStartedAt: task?.timerStartedAt, timerStartedBy: task?.timerStartedBy };
  }
};

export default timeTrackingService;
