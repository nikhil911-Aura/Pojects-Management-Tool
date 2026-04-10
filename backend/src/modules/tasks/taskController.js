import taskService from './taskService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const taskController = {
  async create(req, res, next) {
    const { listId } = req.params;
    const task = await taskService.create(listId, req.user.id, req.validatedBody, req.socketId);
    return createdResponse(res, task, 'Task created successfully');
  },

  async getById(req, res, next) {
    const task = await taskService.getById(req.params.id, req.user.id);
    return successResponse(res, task);
  },

  async update(req, res, next) {
    const task = await taskService.update(req.params.id, req.user.id, req.body, req.socketId);
    return successResponse(res, task, 'Task updated successfully');
  },

  async addAttachment(req, res, next) {
    if (!req.file) { const err = new Error('No file uploaded'); err.statusCode = 400; return next(err); }
    // Debug: log all req.file fields to find where Cloudinary puts the public_id
    console.log('[upload] req.file keys:', Object.keys(req.file));
    console.log('[upload] req.file.filename:', req.file.filename);
    console.log('[upload] req.file.path:', req.file.path);
    console.log('[upload] req.file.public_id:', req.file.public_id);
    const attachment = await taskService.addAttachment(req.params.id, req.user.id, {
      filename: req.file.originalname,
      url: req.file.path,
      publicId: req.file.filename || req.file.public_id || null,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
    return createdResponse(res, attachment, 'Attachment added successfully');
  },

  async removeAttachment(req, res, next) {
    await taskService.removeAttachment(req.params.id, req.user.id, req.params.attachmentId);
    return successResponse(res, null, 'Attachment removed successfully');
  },

  async delete(req, res, next) {
    await taskService.delete(req.params.id, req.user.id, req.socketId);
    return successResponse(res, null, 'Task deleted successfully');
  },

  async moveTask(req, res, next) {
    const task = await taskService.moveTask(req.params.id, req.user.id, req.validatedBody, req.socketId);
    return successResponse(res, task, 'Task moved successfully');
  },

  async assignUser(req, res, next) {
    const { userId } = req.validatedBody;
    const assignee = await taskService.assignUser(req.params.id, req.user.id, userId, req.socketId);
    return successResponse(res, assignee, 'User assigned successfully');
  },

  async removeAssignee(req, res, next) {
    const { assigneeId } = req.params;
    await taskService.removeAssignee(req.params.id, req.user.id, assigneeId, req.socketId);
    return successResponse(res, null, 'Assignee removed successfully');
  },

  async getMilestoneProjects(req, res) {
    const projects = await taskService.getMilestoneProjects(req.params.id, req.user.id);
    return successResponse(res, projects);
  },

  async addMilestoneToProject(req, res) {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });
    const result = await taskService.addMilestoneToProject(req.params.id, req.user.id, projectId);
    return createdResponse(res, result, 'Milestone added to project');
  },

  async removeMilestoneFromProject(req, res) {
    await taskService.removeMilestoneFromProject(req.params.id, req.user.id, req.params.projectId);
    return successResponse(res, null, 'Milestone removed from project');
  },

  async search(req, res, next) {
    const { workspaceId } = req.params;
    const { q } = req.query;
    const tasks = await taskService.search(workspaceId, req.user.id, q);
    return successResponse(res, tasks);
  }
};

export default taskController;
