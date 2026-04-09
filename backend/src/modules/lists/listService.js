import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { emitToProject } from '../../core/socket.js';

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

function canAccessProject(workspaceRole, projectVisibility, projectRole) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (workspaceRole === 'MEMBER' && projectVisibility === 'PUBLIC') return true;
  return projectRole !== null;
}

function canEditProject(workspaceRole, projectRole, customPermissions) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (projectRole === 'EDITOR') return true;
  if (projectRole === 'CUSTOM' && customPermissions) return !!customPermissions['task.edit'];
  return false;
}

async function getContextFromBoard(boardId, userId) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      project: {
        include: {
          workspace: { include: { members: { where: { userId } } } },
          members: { where: { userId }, include: { customRole: true } }
        }
      }
    }
  });

  if (!board) throw ApiError.notFound('Board not found');

  const project = board.project;
  const workspaceMember = project.workspace.members[0];
  if (!workspaceMember) throw ApiError.forbidden('You are not a member of this workspace');

  const projectMember = project.members[0] || null;
  const projectRole = projectMember?.projectRole ?? null;
  const customPermissions = projectMember?.customRole?.permissions ?? null;

  if (!canAccessProject(workspaceMember.role, project.visibility, projectRole)) {
    throw ApiError.forbidden('You do not have access to this board');
  }

  return { board, workspaceMember, projectRole, customPermissions };
}

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
    throw ApiError.forbidden('You do not have access to this list');
  }

  return { list, workspaceMember, projectRole, customPermissions };
}

export const listService = {
  // Create list — EDITOR or workspace Admin
  async create(boardId, userId, listData, excludeSocketId) {
    const { name } = listData;
    const { board, workspaceMember, projectRole, customPermissions } = await getContextFromBoard(boardId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to add sections');
    }

    const lastList = await prisma.list.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' }
    });
    const position = lastList ? lastList.position + 1 : 0;

    const list = await prisma.list.create({
      data: { name, boardId, position },
      include: { tasks: { orderBy: { position: 'asc' } } }
    });
    emitToProject(board.project.id, 'section_created', { list, boardId }, excludeSocketId);
    return list;
  },

  // Get all lists — any project-accessible member
  async getAll(boardId, userId) {
    const { workspaceMember, projectRole, customPermissions } = await getContextFromBoard(boardId, userId);
    // Access already verified in getContextFromBoard

    return prisma.list.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: {
        tasks: {
          where: { parentId: null }, // only top-level tasks
          orderBy: { position: 'asc' },
          include: {
            assignees: {
              include: {
                user: { select: { id: true, name: true, avatar: true } }
              }
            },
            subtasks: {
              orderBy: { position: 'asc' },
              include: {
                assignees: {
                  include: {
                    user: { select: { id: true, name: true, avatar: true } }
                  }
                },
                subtasks: {
                  orderBy: { position: 'asc' },
                  include: {
                    assignees: {
                      include: {
                        user: { select: { id: true, name: true, avatar: true } }
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
  },

  // Update list — EDITOR or workspace Admin
  async update(listId, userId, updateData, excludeSocketId) {
    const { list, workspaceMember, projectRole, customPermissions } = await getContextFromList(listId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to update sections');
    }

    const { name, position } = updateData;
    const updated = await prisma.list.update({
      where: { id: listId },
      data: {
        ...(name && { name }),
        ...(position !== undefined && { position })
      }
    });
    emitToProject(list.board.project.id, 'section_updated', { list: updated }, excludeSocketId);
    return updated;
  },

  // Delete list — EDITOR or workspace Admin
  async delete(listId, userId, excludeSocketId) {
    const { list: listCtx, workspaceMember, projectRole, customPermissions } = await getContextFromList(listId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to delete sections');
    }

    await prisma.list.delete({ where: { id: listId } });
    emitToProject(listCtx.board.project.id, 'section_deleted', { listId }, excludeSocketId);
    return true;
  },

  // Reorder lists — EDITOR or workspace Admin
  async reorder(boardId, userId, listIds) {
    const { workspaceMember, projectRole, customPermissions } = await getContextFromBoard(boardId, userId);

    if (!canEditProject(workspaceMember.role, projectRole, customPermissions)) {
      throw ApiError.forbidden('You need Editor access to reorder sections');
    }

    const updates = listIds.map((id, index) =>
      prisma.list.update({ where: { id }, data: { position: index } })
    );
    await prisma.$transaction(updates);
    return true;
  }
};

export default listService;
