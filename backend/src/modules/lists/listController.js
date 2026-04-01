import listService from './listService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const listController = {
  // Create list
  async create(req, res, next) {
    const { boardId } = req.params;
    const list = await listService.create(boardId, req.user.id, req.validatedBody);
    return createdResponse(res, list, 'List created successfully');
  },

  // Get all lists
  async getAll(req, res, next) {
    const { boardId } = req.params;
    const lists = await listService.getAll(boardId, req.user.id);
    return successResponse(res, lists);
  },

  // Update list
  async update(req, res, next) {
    const list = await listService.update(req.params.id, req.user.id, req.validatedBody);
    return successResponse(res, list, 'List updated successfully');
  },

  // Delete list
  async delete(req, res, next) {
    await listService.delete(req.params.id, req.user.id);
    return successResponse(res, null, 'List deleted successfully');
  },

  // Reorder lists
  async reorder(req, res, next) {
    const { boardId } = req.params;
    const { listIds } = req.validatedBody;
    await listService.reorder(boardId, req.user.id, listIds);
    return successResponse(res, null, 'Lists reordered successfully');
  }
};

export default listController;
