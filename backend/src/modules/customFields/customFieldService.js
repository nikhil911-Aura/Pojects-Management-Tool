import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const customFieldService = {
  // Get all custom fields for a project
  async getByProject(projectId, userId) {
    // Verify access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { workspace: { include: { members: { where: { userId } } } } }
    });
    if (!project) throw ApiError.notFound('Project not found');
    if (!project.workspace.members.length) throw ApiError.forbidden('No access');

    return prisma.customField.findMany({
      where: { projectId },
      orderBy: { position: 'asc' }
    });
  },

  // Create a custom field
  async create(projectId, userId, data) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { workspace: { include: { members: { where: { userId } } } } }
    });
    if (!project) throw ApiError.notFound('Project not found');
    const member = project.workspace.members[0];
    if (!member || member.role === 'GUEST') throw ApiError.forbidden('No permission');

    const lastField = await prisma.customField.findFirst({
      where: { projectId },
      orderBy: { position: 'desc' }
    });

    return prisma.customField.create({
      data: {
        name: data.name,
        type: data.type || 'TEXT',
        options: data.options || null,
        position: lastField ? lastField.position + 1 : 0,
        projectId
      }
    });
  },

  // Update a custom field
  async update(fieldId, userId, data) {
    const field = await prisma.customField.findUnique({
      where: { id: fieldId },
      include: { project: { include: { workspace: { include: { members: { where: { userId } } } } } } }
    });
    if (!field) throw ApiError.notFound('Field not found');
    if (!field.project.workspace.members.length) throw ApiError.forbidden('No access');

    return prisma.customField.update({
      where: { id: fieldId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.options !== undefined && { options: data.options }),
        ...(data.position !== undefined && { position: data.position }),
      }
    });
  },

  // Delete a custom field
  async delete(fieldId, userId) {
    const field = await prisma.customField.findUnique({
      where: { id: fieldId },
      include: { project: { include: { workspace: { include: { members: { where: { userId } } } } } } }
    });
    if (!field) throw ApiError.notFound('Field not found');
    if (!field.project.workspace.members.length) throw ApiError.forbidden('No access');

    await prisma.customField.delete({ where: { id: fieldId } });
    return true;
  },

  // Set a field value for a task
  async setValue(fieldId, taskId, userId, value) {
    // Verify field exists
    const field = await prisma.customField.findUnique({ where: { id: fieldId } });
    if (!field) throw ApiError.notFound('Field not found');

    return prisma.customFieldValue.upsert({
      where: { fieldId_taskId: { fieldId, taskId } },
      update: { value },
      create: { fieldId, taskId, value }
    });
  },

  // Get all field values for tasks in a project (batch)
  async getValuesForProject(projectId) {
    return prisma.customFieldValue.findMany({
      where: { field: { projectId } },
      select: { fieldId: true, taskId: true, value: true }
    });
  }
};

export default customFieldService;
