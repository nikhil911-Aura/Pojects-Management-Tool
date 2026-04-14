import activityService from './activityService.js';
import { successResponse } from '../../core/utils/apiResponse.js';

export const activityController = {
  // Unread inbox count — assignments newer than lastInboxSeenAt
  async getUnreadCount(req, res) {
    const { workspaceId } = req.params;
    const count = await activityService.getUnreadCount(workspaceId, req.user.id);
    return successResponse(res, { count });
  },

  // Mark inbox as seen — update lastInboxSeenAt to now
  async markSeen(req, res) {
    await activityService.markInboxSeen(req.params.workspaceId, req.user.id);
    return successResponse(res, null, 'Inbox marked as seen');
  },

  // Inbox — workspace-wide notifications
  async getInbox(req, res) {
    const { workspaceId } = req.params;
    const { cursor, limit } = req.query;
    const data = await activityService.getInbox(workspaceId, req.user.id, {
      cursor: cursor || null,
      limit: limit ? parseInt(limit) : 30,
    });
    return successResponse(res, data);
  },

  // Get activity logs for a specific task
  async getByTask(req, res) {
    const { taskId } = req.params;
    const activities = await activityService.getByTask(taskId, req.user.id);
    return successResponse(res, activities);
  }
};

export default activityController;
