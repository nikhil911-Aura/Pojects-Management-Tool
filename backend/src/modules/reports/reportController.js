import reportService from './reportService.js';
import prisma from '../../core/database/prisma.js';
import { successResponse, ApiError } from '../../core/utils/apiResponse.js';

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
    billable: input.billable !== undefined && input.billable !== ''
      ? input.billable === 'true' || input.billable === true
      : undefined,
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
  },

  // ── Saved report recipients — OWNER/ADMIN only ──────────────────────────
  async getRecipients(req, res) {
    const { workspaceId } = req.params;
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: req.user.id, role: { in: ['OWNER', 'ADMIN'] } },
    });
    if (!membership) throw ApiError.forbidden('Only workspace admins can manage report recipients');

    const recipients = await prisma.reportRecipient.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { addedBy: { select: { id: true, name: true } } },
    });
    return successResponse(res, recipients);
  },

  async addRecipient(req, res) {
    const { workspaceId } = req.params;
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: req.user.id, role: { in: ['OWNER', 'ADMIN'] } },
    });
    if (!membership) throw ApiError.forbidden('Only workspace admins can manage report recipients');

    const { email, name } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw ApiError.badRequest('Valid email is required');
    }

    // Check if already exists
    const existing = await prisma.reportRecipient.findUnique({
      where: { email_workspaceId: { email: email.toLowerCase().trim(), workspaceId } },
    });
    if (existing) throw ApiError.conflict('This email is already added');

    const recipient = await prisma.reportRecipient.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        workspaceId,
        addedById: req.user.id,
      },
      include: { addedBy: { select: { id: true, name: true } } },
    });
    return successResponse(res, recipient, 'Recipient added');
  },

  async deleteRecipient(req, res) {
    const { recipientId } = req.params;
    const recipient = await prisma.reportRecipient.findUnique({ where: { id: recipientId } });
    if (!recipient) throw ApiError.notFound('Recipient not found');

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: recipient.workspaceId, userId: req.user.id, role: { in: ['OWNER', 'ADMIN'] } },
    });
    if (!membership) throw ApiError.forbidden('Only workspace admins can manage report recipients');

    await prisma.reportRecipient.delete({ where: { id: recipientId } });
    return successResponse(res, null, 'Recipient removed');
  },
};

export default reportController;
