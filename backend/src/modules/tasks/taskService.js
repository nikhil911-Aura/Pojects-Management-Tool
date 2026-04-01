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

function canEditProject(workspaceRole, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  return projectRole === 'EDITOR';
}

function canCommentProject(workspaceRole, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  return projectRole === 'EDITOR' || projectRole === 'COMMENTER';
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
              members: { where: { userId } }
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

  if (!canAccessProject(workspaceMember.role, project.visibility, projectRole)) {
    throw ApiError.forbidden('You do not have access to this project');
  }

  return { list, workspaceMember, projectRole, projectId: project.id };
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
    throw ApiError.forbidden('You do not have access to this project');
  }

  return { task, workspaceMember, projectRole, projectId: project.id };
}

// ── Task Service ──────────────────────────────────────────────────────────────
export const taskService = {

  // Create task — EDITOR or workspace Admin
  async create(listId, userId, taskData) {
    const { title, description, status, priority, dueDate, parentId } = taskData;

    const { list, workspaceMember, projectRole, projectId } = await getContextFromList(listId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
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
        description,
        status: status || 'TODO',
        priority: priority || 'LOW',
        dueDate: dueDate ? new Date(dueDate) : null,
        listId,
        parentId: parentId || null,
        position
      },
      include: {
        list: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        subtasks: true,
        tags: true
      }
    });

    await prisma.activityLog.create({
      data: { action: parentId ? 'SUBTASK_CREATED' : 'TASK_CREATED', details: { title, parentId }, userId, taskId: task.id }
    });

    emitToProject(projectId, 'task_created', { task, listId });
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
        tags: true,
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
  async update(taskId, userId, updateData) {
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
      throw ApiError.forbidden('You need Editor access to edit tasks');
    }

    const { title, description, status, priority, dueDate, parentId } = updateData;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(parentId !== undefined && { parentId: parentId || null })
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        subtasks: true,
        tags: true,
        parent: true
      }
    });

    await prisma.activityLog.create({
      data: { action: 'TASK_UPDATED', details: { changed: Object.keys(updateData) }, userId, taskId }
    });

    emitToProject(projectId, 'task_updated', updated);
    return updated;
  },

  // Delete task — workspace Admin always; EDITOR who created the task
  async delete(taskId, userId) {
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
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
    emitToProject(projectId, 'task_deleted', taskId);
    return true;
  },

  // Move task — EDITOR or workspace Admin
  async moveTask(taskId, userId, moveData) {
    const { listId, position } = moveData;
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
      throw ApiError.forbidden('You need Editor access to move tasks');
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { listId, position: position || 0 },
      include: {
        list: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } }
      }
    });

    await prisma.activityLog.create({
      data: { action: 'TASK_MOVED', details: { fromList: task.listId, toList: listId }, userId, taskId }
    });

    emitToProject(projectId, 'task_moved', { taskId, fromList: task.listId, toList: listId, position });
    return updated;
  },

  // Assign user — EDITOR or workspace Admin
  async assignUser(taskId, userId, assigneeId) {
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
      throw ApiError.forbidden('You need Editor access to assign users');
    }

    const assignee = await prisma.taskAssignee.create({
      data: { userId: assigneeId, taskId },
      include: { user: true }
    });

    emitToProject(projectId, 'user_assigned', { taskId, assignee });
    return assignee;
  },

  // Remove assignee — EDITOR or workspace Admin
  async removeAssignee(taskId, userId, assigneeId) {
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
      throw ApiError.forbidden('You need Editor access to remove assignees');
    }

    await prisma.taskAssignee.delete({ where: { userId_taskId: { userId: assigneeId, taskId } } });
    emitToProject(projectId, 'user_removed', { taskId, assigneeId });
    return true;
  },

  // Add attachment — EDITOR or workspace Admin
  async addAttachment(taskId, userId, fileData) {
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
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
    const { task, workspaceMember, projectRole, projectId } = await getContextFromTask(taskId, userId);

    if (!canEditProject(workspaceMember.role, projectRole)) {
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

    const where = {
      list: { board: { project: { workspaceId } } },
      parentId: null
    };

    if (query && query.trim()) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } }
      ];
    }

    // Guests only see tasks from projects they're explicitly in
    if (membership.role === 'GUEST') {
      where.list = {
        board: {
          project: {
            workspaceId,
            members: { some: { userId } }
          }
        }
      };
    }

    return prisma.task.findMany({
      where,
      include: {
        list: { include: { board: { include: { project: true } } } },
        assignees: { include: { user: true } },
        subtasks: true
      },
      take: 50
    });
  }
};

export default taskService;
