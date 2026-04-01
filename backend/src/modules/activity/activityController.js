import activityService from './activityService.js';
import { successResponse } from '../../core/utils/apiResponse.js';

export const activityController = {
  // Get activity logs
  async getByTask(req, res, next) {
    const { taskId } = req.params;
    const activities = await activityService.getByTask(taskId, req.user.id);
    return successResponse(res, activities);
  }
};

export default activityController;
