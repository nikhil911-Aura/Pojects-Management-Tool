import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

// ── Permission helpers ───────────────────────────────────────────────────────

function isWorkspaceAdmin(workspaceRole) {
  return workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
}

function hasPermission(workspaceRole, projectRole, customPermissions, key) {
  if (isWorkspaceAdmin(workspaceRole)) return true;
  if (customPermissions && typeof customPermissions === 'object') return !!customPermissions[key];
  if (projectRole === 'EDITOR') return true;
  return false;
}

async function getProjectContext(projectId, userId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { include: { members: { where: { userId } } } },
      members: { where: { userId }, include: { customRole: true } }
    }
  });
  if (!project) throw ApiError.notFound('Project not found');

  const workspaceMember = project.workspace.members[0];
  if (!workspaceMember) throw ApiError.forbidden('You are not a member of this workspace');

  const projectMember = project.members[0] || null;
  const projectRole = projectMember?.projectRole ?? null;
  const customPermissions = projectMember?.customRole?.permissions ?? null;

  return { project, workspaceMember, projectRole, customPermissions };
}

async function getFieldContext(fieldId, userId) {
  const field = await prisma.customField.findUnique({
    where: { id: fieldId },
    include: {
      project: {
        include: {
          workspace: { include: { members: { where: { userId } } } },
          members: { where: { userId }, include: { customRole: true } }
        }
      }
    }
  });
  if (!field) throw ApiError.notFound('Field not found');

  const workspaceMember = field.project.workspace.members[0];
  if (!workspaceMember) throw ApiError.forbidden('You are not a member of this workspace');

  const projectMember = field.project.members[0] || null;
  const projectRole = projectMember?.projectRole ?? null;
  const customPermissions = projectMember?.customRole?.permissions ?? null;

  return { field, workspaceMember, projectRole, customPermissions };
}

export const customFieldService = {
  // Get all custom fields for a project — any member with project access
  async getByProject(projectId, userId) {
    await getProjectContext(projectId, userId); // access check

    return prisma.customField.findMany({
      where: { projectId },
      orderBy: { position: 'asc' }
    });
  },

  // Create a custom field
  async create(projectId, userId, data) {
    const { workspaceMember, projectRole, customPermissions } = await getProjectContext(projectId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'field.create')) {
      throw ApiError.forbidden('You do not have permission to create custom fields');
    }

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
    const { workspaceMember, projectRole, customPermissions } = await getFieldContext(fieldId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'field.edit')) {
      throw ApiError.forbidden('You do not have permission to edit custom fields');
    }

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
    const { workspaceMember, projectRole, customPermissions } = await getFieldContext(fieldId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'field.delete')) {
      throw ApiError.forbidden('You do not have permission to delete custom fields');
    }

    await prisma.customField.delete({ where: { id: fieldId } });
    return true;
  },

  // Set a field value for a task
  async setValue(fieldId, taskId, userId, value) {
    const { workspaceMember, projectRole, customPermissions } = await getFieldContext(fieldId, userId);

    if (!hasPermission(workspaceMember.role, projectRole, customPermissions, 'field.edit')) {
      throw ApiError.forbidden('You do not have permission to edit field values');
    }

    return prisma.customFieldValue.upsert({
      where: { fieldId_taskId: { fieldId, taskId } },
      update: { value },
      create: { fieldId, taskId, value }
    });
  },

  // Get all field values for tasks in a project (batch) — read-only, no special permission needed
  async getValuesForProject(projectId) {
    return prisma.customFieldValue.findMany({
      where: { field: { projectId } },
      select: { fieldId: true, taskId: true, value: true }
    });
  }
};

export default customFieldService;
