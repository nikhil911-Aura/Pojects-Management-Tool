import prisma from '../../core/database/prisma.js';

export const addReportEmail = async (workspaceId, email, name = null) => {
  const existing = await prisma.reportEmail.findUnique({
    where: { email_workspaceId: { email, workspaceId } }
  });
  
  if (existing) return existing;
  
  return await prisma.reportEmail.create({
    data: { email, name, workspaceId }
  });
};

export const removeReportEmail = async (workspaceId, emailId) => {
  await prisma.reportEmail.delete({
    where: { id: emailId, workspaceId }
  });
};

export const getReportEmails = async (workspaceId) => {
  return await prisma.reportEmail.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  });
};

export const searchWorkspaceMembers = async (workspaceId, query) => {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: 'ACTIVE',
      user: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      }
    },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      }
    }
  });
  
  return members.map(m => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email
  }));
};