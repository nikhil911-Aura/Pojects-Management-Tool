import projectService from './projectService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const projectController = {
  // Create project
  async create(req, res, next) {
    const { workspaceId } = req.params;
    const project = await projectService.create(workspaceId, req.user.id, req.validatedBody);
    return createdResponse(res, project, 'Project created successfully');
  },

  // Get all projects
  async getAll(req, res, next) {
    const { workspaceId } = req.params;
    const projects = await projectService.getAll(workspaceId, req.user.id);
    return successResponse(res, projects);
  },

  // Get project by ID
  async getById(req, res, next) {
    const project = await projectService.getById(req.params.id, req.user.id);
    return successResponse(res, project);
  },

  // Update project
  async update(req, res, next) {
    const project = await projectService.update(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, project, 'Project updated successfully');
  },

  // Delete project
  async delete(req, res, next) {
    await projectService.delete(req.params.id, req.user.id);
    return successResponse(res, null, 'Project deleted successfully');
  },

  // Add member
  async addMember(req, res, next) {
    const member = await projectService.addMember(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, member, 'Member added successfully');
  },

  // Update member's project role
  async updateMemberRole(req, res, next) {
    const member = await projectService.updateMemberRole(req.params.id, req.user.id, {
      userId: req.params.memberId,
      projectRole: req.body.projectRole
    });
    return successResponse(res, member, 'Member role updated');
  },

  // Remove member
  async removeMember(req, res, next) {
    await projectService.removeMember(req.params.id, req.user.id, req.params.memberId);
    return successResponse(res, null, 'Member removed successfully');
  }
};

export default projectController;
