import projectService from './projectService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const projectController = {
  async create(req, res, next) {
    const { workspaceId } = req.params;
    const project = await projectService.create(workspaceId, req.user.id, req.validatedBody, req.socketId);
    return createdResponse(res, project, 'Project created successfully');
  },

  async getAll(req, res, next) {
    const { workspaceId } = req.params;
    const projects = await projectService.getAll(workspaceId, req.user.id);
    return successResponse(res, projects);
  },

  async getById(req, res, next) {
    const project = await projectService.getById(req.params.id, req.user.id);
    return successResponse(res, project);
  },

  async update(req, res, next) {
    const project = await projectService.update(req.params.id, req.user.id, req.validatedBody, req.socketId);
    return successResponse(res, project, 'Project updated successfully');
  },

  async delete(req, res, next) {
    await projectService.delete(req.params.id, req.user.id, req.socketId);
    return successResponse(res, null, 'Project deleted successfully');
  },

  async addMember(req, res, next) {
    const member = await projectService.addMember(req.params.id, req.user.id, req.validatedBody, req.socketId);
    return successResponse(res, member, 'Member added successfully');
  },

  async updateMemberRole(req, res, next) {
    const member = await projectService.updateMemberRole(req.params.id, req.user.id, {
      userId: req.params.memberId,
      projectRole: req.body.projectRole
    }, req.socketId);
    return successResponse(res, member, 'Member role updated');
  },

  async removeMember(req, res, next) {
    await projectService.removeMember(req.params.id, req.user.id, req.params.memberId, req.socketId);
    return successResponse(res, null, 'Member removed successfully');
  }
};

// Separate controller for the static permission-keys endpoint
export const permissionKeysController = {
  async getProjectPermissionKeys(req, res) {
    const { PROJECT_PERMISSION_KEYS } = await import('../../core/utils/projectPermissions.js');
    return successResponse(res, PROJECT_PERMISSION_KEYS);
  }
};

// Controller for project-level named roles CRUD
import projectRoleService from './projectRoleService.js';

export const projectRoleController = {
  async getRoles(req, res) {
    const roles = await projectRoleService.getRoles(req.params.workspaceId);
    return successResponse(res, roles);
  },
  async createRole(req, res) {
    const role = await projectRoleService.createRole(req.params.workspaceId, req.user.id, req.body);
    return createdResponse(res, role, 'Role created');
  },
  async updateRole(req, res) {
    const role = await projectRoleService.updateRole(req.params.roleId, req.user.id, req.body);
    return successResponse(res, role, 'Role updated');
  },
  async deleteRole(req, res) {
    await projectRoleService.deleteRole(req.params.roleId, req.user.id);
    return successResponse(res, null, 'Role deleted');
  },
};

export default projectController;
