import commentService from './commentService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const commentController = {
  // Create comment
  async create(req, res, next) {
    const { taskId } = req.params;
    const { content } = req.validatedBody;
    const comment = await commentService.create(taskId, req.user.id, content);
    return createdResponse(res, comment, 'Comment added successfully');
  },

  // Get comments
  async getByTask(req, res, next) {
    const { taskId } = req.params;
    const comments = await commentService.getByTask(taskId, req.user.id);
    return successResponse(res, comments);
  },

  // Update comment
  async update(req, res, next) {
    const { content } = req.validatedBody;
    const comment = await commentService.update(req.params.id, req.user.id, content);
    return successResponse(res, comment, 'Comment updated successfully');
  },

  // Delete comment
  async delete(req, res, next) {
    await commentService.delete(req.params.id, req.user.id);
    return successResponse(res, null, 'Comment deleted successfully');
  }
};

export default commentController;
