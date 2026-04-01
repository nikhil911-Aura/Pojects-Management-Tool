import taskService from './taskService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const taskController = {
  // Create task
  async create(req, res, next) {
    const { listId } = req.params;
    const task = await taskService.create(listId, req.user.id, req.validatedBody);
    return createdResponse(res, task, 'Task created successfully');
  },

  // Get task by ID
  async getById(req, res, next) {
    const task = await taskService.getById(req.params.id, req.user.id);
    return successResponse(res, task);
  },

  // Update task
  async update(req, res, next) {
    const task = await taskService.update(req.params.id, req.user.id, req.body);
    return successResponse(res, task, 'Task updated successfully');
  },

  // Add attachment
  async addAttachment(req, res, next) {
    if (!req.file) {
      const err = new Error('No file uploaded');
      err.statusCode = 400;
      return next(err);
    }

    const attachment = await taskService.addAttachment(req.params.id, req.user.id, {
      filename: req.file.originalname,
      url: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    return createdResponse(res, attachment, 'Attachment added successfully');
  },

  // Remove attachment
  async removeAttachment(req, res, next) {
    await taskService.removeAttachment(req.params.id, req.user.id, req.params.attachmentId);
    return successResponse(res, null, 'Attachment removed successfully');
  },

  // Delete task
  async delete(req, res, next) {
    await taskService.delete(req.params.id, req.user.id);
    return successResponse(res, null, 'Task deleted successfully');
  },

  // Move task
  async moveTask(req, res, next) {
    const task = await taskService.moveTask(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, task, 'Task moved successfully');
  },

  // Assign user
  async assignUser(req, res, next) {
    const { userId } = req.validatedBody;
    const assignee = await taskService.assignUser(req.params.id, req.user.id, userId);
    return successResponse(res, assignee, 'User assigned successfully');
  },

  // Remove assignee
  async removeAssignee(req, res, next) {
    const { assigneeId } = req.params;
    await taskService.removeAssignee(req.params.id, req.user.id, assigneeId);
    return successResponse(res, null, 'Assignee removed successfully');
  },

  // Search tasks
  async search(req, res, next) {
    const { workspaceId } = req.params;
    const { q } = req.query;
    const tasks = await taskService.search(workspaceId, req.user.id, q);
    return successResponse(res, tasks);
  }
};

export default taskController;
