import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import { emitToWorkspace } from '../../core/socket.js';

export const workspaceService = {
  // Create workspace
  async create(userId, workspaceData) {
    const { name, description, icon } = workspaceData;

    // Create workspace with owner as first member
    const workspace = await prisma.workspace.create({
      data: {
        name,
        description,
        icon,
        members: {
          create: {
            userId,
            role: 'OWNER'
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    return workspace;
  },

  // Get all workspaces for user
  async getAll(userId) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, projects: true } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return memberships.map(m => ({
      ...m.workspace,
      role: m.role
    }));
  },

  // Get workspace by ID
  async getById(workspaceId, userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId
      },
      include: {
        workspace: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true
                  }
                },
                customRole: { select: { id: true, name: true, color: true, permissions: true } }
              }
            },
            projects: {
              include: {
                members: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        avatar: true
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

    if (!membership) {
      throw ApiError.notFound('Workspace not found or access denied');
    }

    return {
      ...membership.workspace,
      role: membership.role
    };
  },

  // Update workspace
  async update(workspaceId, userId, updateData) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to update this workspace');
    }

    const { name, description, icon } = updateData;

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon })
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    return workspace;
  },

  // Delete workspace
  async delete(workspaceId, userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        role: 'OWNER'
      }
    });

    if (!membership) {
      throw ApiError.forbidden('Only the owner can delete this workspace');
    }

    await prisma.workspace.delete({
      where: { id: workspaceId }
    });

    return true;
  },

  // Invite user to workspace
  async inviteUser(workspaceId, ownerId, inviteData) {
    const { email, role = 'MEMBER' } = inviteData;

    // Check if owner has permission
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: ownerId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to invite users');
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // In a real app, you would send an invitation email
      // For now, we'll simulate by returning a message
      return { message: `Invitation sent to ${email}` };
    }

    // Check if user is already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId
        }
      }
    });

    if (existingMember) {
      throw ApiError.conflict('User is already a member of this workspace');
    }

    // Add user to workspace
    await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId,
        role
      }
    });

    return { message: `User ${email} added to workspace` };
  },

  // Remove user from workspace
  async removeUser(workspaceId, ownerId, userIdToRemove) {
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: ownerId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to remove users');
    }

    // Cannot remove owner
    const userToRemove = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: userIdToRemove
      }
    });

    if (userToRemove?.role === 'OWNER') {
      throw ApiError.forbidden('Cannot remove the workspace owner');
    }

    await prisma.workspaceMember.delete({
      where: {
        userId_workspaceId: {
          userId: userIdToRemove,
          workspaceId
        }
      }
    });

    // Broadcast so all open workspace pages refresh live
    emitToWorkspace(workspaceId, 'workspace_member_removed', {
      userId: userIdToRemove,
      workspaceId,
    });

    return true;
  },

  // Update member role
  async updateMemberRole(workspaceId, ownerId, updateData) {
    const { userId, role, customRoleId } = updateData;

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: ownerId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to update roles');
    }

    // Cannot change owner role
    const targetMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId
      }
    });

    if (targetMember?.role === 'OWNER') {
      throw ApiError.forbidden('Cannot change owner role');
    }

    // Validate customRoleId if provided (null/undefined explicitly clears it)
    if (customRoleId) {
      const cr = await prisma.customProjectRole.findUnique({ where: { id: customRoleId } });
      if (!cr || cr.workspaceId !== workspaceId) {
        throw ApiError.badRequest('Invalid custom role for this workspace');
      }
    }

    const updated = await prisma.workspaceMember.update({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId
        }
      },
      data: {
        role,
        // Explicitly set to null when no custom role chosen (clears previous)
        customRoleId: customRoleId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        customRole: { select: { id: true, name: true, color: true, permissions: true } }
      }
    });

    // Broadcast so all open workspace pages (admin views, target user's own session,
    // project share modals) refresh live.
    emitToWorkspace(workspaceId, 'workspace_member_role_changed', {
      userId,
      workspaceId,
      role,
      member: updated,
    });

    return updated;
  }
};

export default workspaceService;
