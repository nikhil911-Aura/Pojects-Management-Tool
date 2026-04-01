import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const projectService = {
  // Create project
  async create(workspaceId, userId, projectData) {
    const { name, description, icon, color, visibility } = projectData;

    // Check workspace membership — all roles can create projects (like real Asana)
    // Guests are forced to PRIVATE visibility
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to create projects in this workspace');
    }

    // Guests can only create Private projects
    const isGuest = membership.role === 'GUEST';
    if (isGuest && visibility && visibility !== 'PRIVATE') {
      throw ApiError.forbidden('Guests can only create private projects');
    }

    // Create project with board and default list
    const project = await prisma.project.create({
      data: {
        name,
        description,
        icon,
        color,
        visibility: visibility || 'PRIVATE',
        workspaceId,
        board: {
          create: {
            name: 'Board',
            lists: {
              create: {
                name: 'To do',
                position: 0,
              }
            }
          }
        },
        members: {
          create: {
            userId,
            role: membership.role,
            projectRole: 'EDITOR',
          }
        }
      },
      include: {
        board: {
          include: {
            lists: true
          }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        workspace: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return project;
  },

  // Get all projects in workspace
  async getAll(workspaceId, userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have access to this workspace');
    }

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

    const projects = await prisma.project.findMany({
      where: {
        workspaceId,
        // Admins/Owners see all projects
        // Members see: PUBLIC projects + PRIVATE projects they're explicitly in
        // Guests see: ONLY projects they're explicitly in (regardless of visibility)
        ...(!isAdmin && {
          OR: [
            ...(membership.role === 'MEMBER' ? [{ visibility: 'PUBLIC' }] : []),
            { members: { some: { userId } } }
          ]
        })
      },
      include: {
        board: true,
        workspace: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true }
            }
          }
        },
        _count: { select: { members: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return projects;
  },

  // Get project by ID
  async getById(projectId, userId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        board: {
          include: {
            lists: {
              orderBy: { position: 'asc' },
              include: {
                tasks: {
                  orderBy: { position: 'asc' },
                  include: {
                    assignees: {
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
        },
        workspace: {
          select: {
            id: true,
            name: true
          }
        },
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

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have access to this project');
    }

    const isAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

    if (!isAdmin) {
      const isProjectMember = project.members.some(m => m.userId === userId);
      const isPublicForMember = membership.role === 'MEMBER' && project.visibility === 'PUBLIC';

      if (!isProjectMember && !isPublicForMember) {
        throw ApiError.forbidden('You do not have access to this project');
      }
    }

    return project;
  },

  // Update project
  async update(projectId, userId, updateData) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check workspace permission
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: project.workspaceId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to update this project');
    }

    const { name, description, icon, visibility } = updateData;

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        ...(visibility && { visibility })
      },
      include: {
        board: true
      }
    });

    return updated;
  },

  // Delete project
  async delete(projectId, userId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check workspace permission
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: project.workspaceId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to delete this project');
    }

    await prisma.project.delete({
      where: { id: projectId }
    });

    return true;
  },

  // Add member to project
  async addMember(projectId, userId, memberData) {
    const { userId: newMemberId, role = 'MEMBER', projectRole = 'EDITOR' } = memberData;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check permission
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: project.workspaceId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to add members');
    }

    // Check if already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: newMemberId,
          projectId
        }
      }
    });

    if (existingMember) {
      throw ApiError.conflict('User is already a member of this project');
    }

    const member = await prisma.projectMember.create({
      data: {
        userId: newMemberId,
        projectId,
        role,
        projectRole
      },
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
    });

    return member;
  },

  // Remove member from project
  async removeMember(projectId, userId, memberIdToRemove) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    // Check permission
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: project.workspaceId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have permission to remove members');
    }

    await prisma.projectMember.delete({
      where: {
        userId_projectId: {
          userId: memberIdToRemove,
          projectId
        }
      }
    });

    return true;
  },

  // Update a project member's role (Editor / Commenter / Viewer)
  async updateMemberRole(projectId, userId, memberData) {
    const { userId: targetUserId, projectRole } = memberData;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw ApiError.notFound('Project not found');

    // Only workspace Admin/Owner can change project roles
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: project.workspaceId, userId, role: { in: ['OWNER', 'ADMIN'] } }
    });
    if (!membership) throw ApiError.forbidden('You do not have permission to change project roles');

    const updated = await prisma.projectMember.update({
      where: { userId_projectId: { userId: targetUserId, projectId } },
      data: { projectRole },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
    });

    return updated;
  }
};

export default projectService;
