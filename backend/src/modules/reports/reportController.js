import reportService from './reportService.js';
import { successResponse } from '../../core/utils/apiResponse.js';

export const reportController = {
  async getMyTimesheet(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const filters = {
      ...req.query,
      projectIds: req.query.projectIds ? req.query.projectIds.split(',') : undefined,
      period: req.query.period
    };
    const data = await reportService.getMyTimesheet(userId, workspaceId, filters);
    return successResponse(res, data);
  },

  async getTeamReport(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const filters = {
      ...req.query,
      userIds: req.query.userIds ? req.query.userIds.split(',') : undefined,
      projectIds: req.query.projectIds ? req.query.projectIds.split(',') : undefined,
      groupBy: req.query.groupBy
    };
    const data = await reportService.getTeamReport(workspaceId, userId, filters);
    return successResponse(res, data);
  },

  async getReportSummary(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const filters = {
      ...req.query,
      userIds: req.query.userIds ? req.query.userIds.split(',') : undefined,
      projectIds: req.query.projectIds ? req.query.projectIds.split(',') : undefined
    };
    const data = await reportService.getReportSummary(workspaceId, userId, filters);
    return successResponse(res, data);
  },

  async exportReport(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const filters = {
      ...req.query,
      projectIds: req.query.projectIds ? req.query.projectIds.split(',') : undefined
    };
    const format = req.query.format || 'csv';
    const csv = await reportService.exportReport(workspaceId, userId, filters, format);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=time-report.csv');
    return res.send(csv);
  },

  async emailReport(req, res) {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const filters = {
      ...req.body,
      projectIds: req.body.projectIds || undefined
    };
    const recipients = req.body.recipients || [];
    const result = await reportService.emailReport(workspaceId, userId, filters, recipients);
    return successResponse(res, result);
  }
};

export default reportController;