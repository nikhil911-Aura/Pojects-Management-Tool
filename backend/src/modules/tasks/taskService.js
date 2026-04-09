import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { emitToProject } from '../../core/socket.js';

// ── Workspace role hierarchy ──────────────────────────────────────────────────
// OWNER / ADMIN  →  workspace administrators (bypass all project-level checks)
// MEMBER         →  regular workspace member (governed by ProjectRole within each project)
// GUEST          →  external user (can ONLY access projects they're explicitly added to)

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

// ── Project-level permission helpers ─────────────────────────────────────────
// projectRole: 'EDITOR' | 'COMMENTER' | 'VIEWER' | null (not a project member)

function canAccessProject(workspaceRole, projectVisibility, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  // Public projects: any workspace MEMBER can view (but not necessarily edit)
  if (workspaceRole === 'MEMBER' && projectVisibility === 'PUBLIC') return true;
  // Private projects + GUESTs: must be an explicit project member
  return projectRole !== null;
}

function canEditProject(workspaceRole, projectRole, customPermissions) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (projectRole === 'EDITOR') return true;
  // CUSTOM role: check granular permissions
  if (projectRole === 'CUSTOM' && customPermissions) return !!customPermissions['task.edit'];
  return false;
}

function canCommentProject(workspaceRole, projectRole, customPermissions) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (projectRole === 'EDITOR' || projectRole === 'COMMENTER') return true;
  if (projectRole === 'CUSTOM' && customPermissions) return !!customPermissions['comment.create'];
  return false;
}

// Granular check for any permission key on a CUSTOM role
function hasPermission(workspaceRole, projectRole, customPermissions, key) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (projectRole === 'EDITOR') return true;
  if (projectRole === 'CUSTOM' && customPermissions) return !!customPermissions[key];
  return false;
}

// ── Context resolvers ─────────────────────────────────────────────────────────

async function getContextFromList(listId, userId) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
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
  });

  if (!list) throw ApiError.notFound('List not found');

  const project = list.board.project;
  const workspaceMember = project.workspace.members[0];
  if (!workspaceMember) throw ApiError.forbidden('You are not a member of this workspace');

  const projectMember = project.members[0] || null;
  const projectRole = projectMember?.projectRole ?? null;
  const customPermissions = projectMember?.customRole?.permissions ?? null;

  if (!canAccessProject(workspaceMember.role, project.visibility, projectRole)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  return { list, workspaceMember, projectRole, customPermissions, projectId: project.id };
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
    throw ApiError.forbidden('You do not have access to this project');
  }

  return { task, workspaceMember, projectRole, customPermissions, projectId: project.id };
}

// ── Task Service ──────────────────────────────────────────────────────────────
export const taskService = {

  // Create task — EDITOR or workspace Admin
  async create(listId, userId, taskData, excludeSocketId) {
    const { title, description, status, priority, dueDate, estimatedTime, actualTime, taskType, parentId } = taskData;

    const { list, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromList(listId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to create tasks');
    }

    const lastTask = await prisma.task.findFirst({
      where: { listId, parentId: parentId || null },
      orderBy: { position: 'desc' }
    });
    const position = lastTask ? lastTask.position + 1 : 0;

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        taskType: taskType || 'DEFAULT_TASK',
        status: status || 'TODO',
        priority: priority || 'LOW',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedTime: estimatedTime != null ? parseInt(estimatedTime) : null,
        actualTime: actualTime != null ? parseInt(actualTime) : null,
        listId,
        parentId: parentId || null,
        position
      },
      include: {
        list: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        subtasks: true
      }
    });

    try {
      await prisma.activityLog.create({
        data: { action: parentId ? 'SUBTASK_CREATED' : 'TASK_CREATED', details: { title, parentId: parentId || null }, userId, taskId: task.id }
      });
    } catch (e) {
      // Don't fail task creation if activity log fails
    }

    emitToProject(projectId, 'task_created', { task, listId }, excludeSocketId);
    return task;
  },

  // Get task — any member who can access the project (Viewer, Commenter, Editor, Admin)
  async getById(taskId, userId) {
    await getContextFromTask(taskId, userId); // access check

    return prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: { include: { board: { include: { project: true } } } },
        parent: { select: { id: true, title: true } },
        subtasks: {
          include: { assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
          orderBy: { position: 'asc' }
        },
        assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        tags: { select: { id: true, name: true, color: true } },
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' }
        },
        attachments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        activityLogs: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  },

  // Update task — EDITOR or workspace Admin
  async update(taskId, userId, updateData, excludeSocketId) {
    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to edit tasks');
    }

    const { title, description, status, priority, dueDate, estimatedTime, actualTime, taskType, parentId } = updateData;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(taskType && { taskType }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(estimatedTime !== undefined && { estimatedTime: estimatedTime != null ? parseInt(estimatedTime) : null }),
        ...(actualTime !== undefined && { actualTime: actualTime != null ? parseInt(actualTime) : null }),
        ...(parentId !== undefined && { parentId: parentId || null })
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        subtasks: true,
        parent: true
      }
    });

    try {
      await prisma.activityLog.create({
        data: { action: 'TASK_UPDATED', details: { changed: Object.keys(updateData) }, userId, taskId }
      });
    } catch (e) {
      // Don't fail task update if activity log fails
    }

    emitToProject(projectId, 'task_updated', updated, excludeSocketId);
    return updated;
  },

  // Delete task — workspace Admin always; EDITOR who created the task
  async delete(taskId, userId, excludeSocketId) {
    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to delete tasks');
    }

    // Non-admins (project Editors) can only delete tasks they created
    if (!isWorkspaceAdmin(workspaceMember.role)) {
      const created = await prisma.activityLog.findFirst({
        where: { taskId, userId, action: { in: ['TASK_CREATED', 'SUBTASK_CREATED'] } }
      });
      if (!created) {
        throw ApiError.forbidden('You can only delete tasks you created');
      }
    }

    await prisma.task.delete({ where: { id: taskId } });
    emitToProject(projectId, 'task_deleted', taskId, excludeSocketId);
    return true;
  },

  // Move task — EDITOR or workspace Admin
  // Reshuffles sibling positions in a single transaction so that:
  //   • the moved task lands at the EXACT requested index in the destination container
  //   • all sibling positions are dense, unique, and stable across reloads
  //   • cross-container moves clean up the source container too
  async moveTask(taskId, userId, moveData, excludeSocketId) {
    const { listId, position, parentId } = moveData;
    const targetIndex = Number.isFinite(position) ? Math.max(0, Math.floor(position)) : 0;
    const newParentId = parentId === undefined ? undefined : (parentId || null);
    console.log('[moveTask v2/transactional]', { taskId, listId, targetIndex, parentId: newParentId });

    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to move tasks');
    }

    // Guard: prevent setting a task as its own ancestor (direct cycle)
    if (newParentId && newParentId === taskId) {
      throw ApiError.badRequest('A task cannot be its own parent');
    }

    // Capture source container BEFORE the move so we can reshuffle it too
    const sourceListId = task.listId;
    const sourceParentId = task.parentId || null;
    const destinationParentId = newParentId === undefined ? sourceParentId : newParentId;
    const sameContainer = sourceListId === listId && sourceParentId === destinationParentId;

    // Deeper cycle guard: walk up the destination parent chain to ensure
    // we're not nesting a task inside one of its own descendants.
    if (destinationParentId) {
      let cursor = destinationParentId;
      const visited = new Set();
      while (cursor && !visited.has(cursor)) {
        if (cursor === taskId) {
          throw ApiError.badRequest('Cannot move a task inside its own subtree');
        }
        visited.add(cursor);
        const parent = await prisma.task.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = parent?.parentId || null;
      }
    }

    // Helper: rewrite an ordered list of task IDs to dense positions.
    // Uses sequential prisma.task.update inside the transaction — slow for very
    // large lists but bulletproof. The 15s transaction timeout below covers it.
    const STEP = 1024;
    const bulkRepositioned = async (tx, idsInOrder) => {
      for (let i = 0; i < idsInOrder.length; i++) {
        await tx.task.update({
          where: { id: idsInOrder[i] },
          data: { position: (i + 1) * STEP },
        });
      }
    };

    const updated = await prisma.$transaction(
      async (tx) => {
        // 1. Detach the moved task: update its listId/parentId and park it at sentinel position -1.
        await tx.task.update({
          where: { id: taskId },
          data: {
            listId,
            position: -1,
            ...(newParentId !== undefined && { parentId: newParentId }),
          },
        });

        // 2. Fetch destination siblings (excluding the moved task) in current order.
        const destSiblings = await tx.task.findMany({
          where: { listId, parentId: destinationParentId, NOT: { id: taskId } },
          orderBy: { position: 'asc' },
          select: { id: true },
        });

        // 3. Splice the moved task in at the requested index.
        const destOrderedIds = destSiblings.map((s) => s.id);
        const insertAt = Math.min(targetIndex, destOrderedIds.length);
        destOrderedIds.splice(insertAt, 0, taskId);

        // 4. Single-statement bulk reposition of the destination container.
        await bulkRepositioned(tx, destOrderedIds);

        // 5. If the source container changed, re-densify it too in one statement.
        if (!sameContainer) {
          const sourceSiblings = await tx.task.findMany({
            where: { listId: sourceListId, parentId: sourceParentId },
            orderBy: { position: 'asc' },
            select: { id: true },
          });
          await bulkRepositioned(tx, sourceSiblings.map((s) => s.id));
        }

        // 6. Return the moved task with its joined data.
        return tx.task.findUnique({
          where: { id: taskId },
          include: {
            list: { select: { id: true, name: true } },
            assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
          },
        });
      },
      { timeout: 15000, maxWait: 5000 }
    ).catch((err) => {
      console.error('[moveTask] transaction failed', {
        taskId, listId, targetIndex, parentId: newParentId,
        sourceListId, sourceParentId, sameContainer,
        error: err?.message,
        code: err?.code,
        meta: err?.meta,
      });
      throw err;
    });

    // Activity log is non-critical — never let it fail the move.
    try {
      await prisma.activityLog.create({
        data: { action: 'TASK_MOVED', details: { fromList: task.listId, toList: listId }, userId, taskId },
      });
    } catch (logErr) {
      console.warn('[moveTask] activityLog write failed (non-fatal)', logErr?.message);
    }

    emitToProject(
      projectId,
      'task_moved',
      { taskId, fromList: task.listId, toList: listId, position: targetIndex, parentId: destinationParentId },
      excludeSocketId
    );
    return updated;
  },

  // Assign user — EDITOR or workspace Admin
  async assignUser(taskId, userId, assigneeId, excludeSocketId) {
    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to assign users');
    }

    const assignee = await prisma.taskAssignee.create({
      data: { userId: assigneeId, taskId },
      include: { user: true }
    });

    emitToProject(projectId, 'user_assigned', { taskId, assignee }, excludeSocketId);
    return assignee;
  },

  // Remove assignee — EDITOR or workspace Admin
  async removeAssignee(taskId, userId, assigneeId, excludeSocketId) {
    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to remove assignees');
    }

    await prisma.taskAssignee.delete({ where: { userId_taskId: { userId: assigneeId, taskId } } });
    emitToProject(projectId, 'user_removed', { taskId, assigneeId }, excludeSocketId);
    return true;
  },

  // Add attachment — EDITOR or workspace Admin
  async addAttachment(taskId, userId, fileData) {
    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to add attachments');
    }

    const attachment = await prisma.attachment.create({
      data: { ...fileData, taskId, userId },
      include: { user: { select: { id: true, name: true } } }
    });

    emitToProject(projectId, 'attachment_added', { taskId, attachment });
    return attachment;
  },

  // Remove attachment — workspace Admin always; EDITOR who owns the attachment
  async removeAttachment(taskId, userId, attachmentId) {
    const { task, workspaceMember, projectRole, customPermissions, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to remove attachments');
    }

    if (!isWorkspaceAdmin(workspaceMember.role)) {
      const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
      if (!attachment || attachment.userId !== userId) {
        throw ApiError.forbidden('You can only remove your own attachments');
      }
    }

    await prisma.attachment.delete({ where: { id: attachmentId } });
    emitToProject(projectId, 'attachment_removed', { taskId, attachmentId });
    return true;
  },

  // Search tasks — any workspace member (read-only)
  async search(workspaceId, userId, query) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const isGuest = membership.role === 'GUEST';

    // Build project-level filter based on role
    let projectFilter = { workspaceId };
    if (!isAdmin) {
      // Members: see tasks from PUBLIC projects + projects they're added to
      // Guests: see tasks ONLY from projects they're added to
      projectFilter = {
        workspaceId,
        OR: [
          ...(isGuest ? [] : [{ visibility: 'PUBLIC' }]),
          { members: { some: { userId } } }
        ]
      };
    }

    // Build search conditions
    const searchConditions = query?.trim()
      ? [
          { title: { contains: query.trim(), mode: 'insensitive' } },
          { description: { contains: query.trim(), mode: 'insensitive' } }
        ]
      : [];

    const where = {
      parentId: null, // only top-level tasks
      list: { board: { project: projectFilter } },
      ...(searchConditions.length > 0 && { OR: searchConditions })
    };

    return prisma.task.findMany({
      where,
      include: {
        list: {
          select: {
            id: true,
            name: true,
            board: {
              select: {
                id: true,
                project: { select: { id: true, name: true, color: true } }
              }
            }
          }
        },
        assignees: {
          include: { user: { select: { id: true, name: true, avatar: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 20
    });
  }
};

export default taskService;
