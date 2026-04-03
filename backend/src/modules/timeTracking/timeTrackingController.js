import timeTrackingService from './timeTrackingService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

const timeTrackingController = {
  async getEntries(req, res) {
    const entries = await timeTrackingService.getEntries(req.params.taskId);
    return successResponse(res, entries);
  },

  async addEntry(req, res) {
    const result = await timeTrackingService.addEntry(req.params.taskId, req.user.id, req.body, req.socketId);
    return createdResponse(res, result);
  },

  async updateEntry(req, res) {
    const result = await timeTrackingService.updateEntry(req.params.entryId, req.user.id, req.body, req.socketId);
    return successResponse(res, result);
  },

  async deleteEntry(req, res) {
    const result = await timeTrackingService.deleteEntry(req.params.entryId, req.user.id, req.socketId);
    return successResponse(res, result);
  },

  async startTimer(req, res) {
    const result = await timeTrackingService.startTimer(req.params.taskId, req.user.id, req.socketId);
    return successResponse(res, result);
  },

  async stopTimer(req, res) {
    const result = await timeTrackingService.stopTimer(req.params.taskId, req.user.id, req.socketId);
    return successResponse(res, result);
  },

  async getTimerStatus(req, res) {
    const result = await timeTrackingService.getTimerStatus(req.params.taskId);
    return successResponse(res, result);
  }
};

export default timeTrackingController;
