import prisma from '../../core/database/prisma.js';

export const viewPrefsService = {
  async get(userId, projectId) {
    const pref = await prisma.userViewPreference.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { colWidths: true },
    });
    return pref?.colWidths ?? {};
  },

  async upsert(userId, projectId, colWidths) {
    return prisma.userViewPreference.upsert({
      where: { userId_projectId: { userId, projectId } },
      update: { colWidths },
      create: { userId, projectId, colWidths },
      select: { colWidths: true },
    });
  },
};
