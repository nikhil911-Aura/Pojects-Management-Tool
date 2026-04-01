import workspaceService from './workspaceService.js';
import workspaceInviteService from './workspaceInviteService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const workspaceController = {
  // Create workspace
  async create(req, res, next) {
    const workspace = await workspaceService.create(req.user.id, req.validatedBody);
    return createdResponse(res, workspace, 'Workspace created successfully');
  },

  // Get all workspaces
  async getAll(req, res, next) {
    const workspaces = await workspaceService.getAll(req.user.id);
    return successResponse(res, workspaces);
  },

  // Get workspace by ID
  async getById(req, res, next) {
    const workspace = await workspaceService.getById(req.params.id, req.user.id);
    return successResponse(res, workspace);
  },

  // Update workspace
  async update(req, res, next) {
    const workspace = await workspaceService.update(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, workspace, 'Workspace updated successfully');
  },

  // Delete workspace
  async delete(req, res, next) {
    await workspaceService.delete(req.params.id, req.user.id);
    return successResponse(res, null, 'Workspace deleted successfully');
  },

  // Invite user
  async inviteUser(req, res, next) {
    const result = await workspaceInviteService.createInvite(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, result);
  },

  // Get pending invites
  async getInvites(req, res, next) {
    const invites = await workspaceInviteService.getWorkspaceInvites(req.params.id);
    return successResponse(res, invites);
  },

  // Remove user
  async removeUser(req, res, next) {
    await workspaceService.removeUser(req.params.id, req.user.id, req.params.userId);
    return successResponse(res, null, 'User removed successfully');
  },

  // Update member role
  async updateMemberRole(req, res, next) {
    const result = await workspaceService.updateMemberRole(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, result, 'Role updated successfully');
  }
};

export default workspaceController;
