import reportService from './reportService.js';
import { successResponse } from '../../core/utils/apiResponse.js';

function parseFilters(input) {
  return {
    period: input.period || undefined,
    startDate: input.startDate || undefined,
    endDate: input.endDate || undefined,
    projectIds: input.projectIds
      ? (Array.isArray(input.projectIds) ? input.projectIds : String(input.projectIds).split(',').filter(Boolean))
      : undefined,
    userIds: input.userIds
      ? (Array.isArray(input.userIds) ? input.userIds : String(input.userIds).split(',').filter(Boolean))
      : undefined,
    groupBy: input.groupBy || undefined,
    scope: input.scope || undefined,
  };
}

export const reportController = {
  async getMyTimesheet(req, res) {
    const { workspaceId } = req.params;
    const filters = parseFilters(req.query);
    const data = await reportService.getMyTimesheet(req.user.id, workspaceId, filters);
    return successResponse(res, data);
  },

  async getTeamReport(req, res) {
    const { workspaceId } = req.params;
    const filters = parseFilters(req.query);
    const data = await reportService.getTeamReport(workspaceId, req.user.id, filters);
    return successResponse(res, data);
  },

  async getReportSummary(req, res) {
    const { workspaceId } = req.params;
    const filters = parseFilters(req.query);
    const data = await reportService.getReportSummary(workspaceId, req.user.id, filters);
    return successResponse(res, data);
  },

  async exportReport(req, res) {
    const { workspaceId } = req.params;
    const filters = parseFilters(req.query);
    const format = req.query.format || 'xlsx';
    const data = await reportService.exportReport(workspaceId, req.user.id, filters, format);
    const today = new Date().toISOString().split('T')[0];

    if (format === 'xlsx') {
      const filename = `work-report-${today}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', data.byteLength);
      return res.end(Buffer.from(data));
    }

    if (format === 'csv') {
      const filename = `work-report-${today}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Prepend BOM so Excel opens UTF-8 correctly
      return res.send('\uFEFF' + data);
    }

    return successResponse(res, data);
  },

  async emailReport(req, res) {
    const { workspaceId } = req.params;
    const recipients = req.body.recipients || [];
    const filters = parseFilters(req.body);
    const options = { message: req.body.message || '' };
    const result = await reportService.emailReport(workspaceId, req.user.id, filters, recipients, options);
    return successResponse(res, result);
  }
};

export default reportController;
