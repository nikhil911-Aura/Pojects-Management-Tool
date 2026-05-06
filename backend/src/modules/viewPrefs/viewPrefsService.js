import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

async function checkProjectAccess(userId, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { include: { members: { where: { userId } } } },
      members: { where: { userId } },
    },
  });
  if (!project) throw ApiError.notFound('Project not found');

  const workspaceMember = project.workspace.members[0];
  if (!workspaceMember) throw ApiError.forbidden('You are not a member of this workspace');

  const isAdmin = workspaceMember.role === 'OWNER' || workspaceMember.role === 'ADMIN';
  const isProjectMember = project.members.length > 0;
  const isPublic = project.visibility === 'PUBLIC';

  if (!isAdmin && !isProjectMember && !isPublic) {
    throw ApiError.forbidden('You do not have access to this project');
  }
}

export const viewPrefsService = {
  async get(userId, projectId) {
    await checkProjectAccess(userId, projectId);
    const pref = await prisma.userViewPreference.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { colWidths: true },
    });
    return pref?.colWidths ?? {};
  },

  async upsert(userId, projectId, colWidths) {
    await checkProjectAccess(userId, projectId);
    return prisma.userViewPreference.upsert({
      where: { userId_projectId: { userId, projectId } },
      update: { colWidths },
      create: { userId, projectId, colWidths },
      select: { colWidths: true },
    });
  },
};
