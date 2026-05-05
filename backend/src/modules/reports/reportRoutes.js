import express from 'express';
import reportController from './reportController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';

const router = express.Router();

// Reports
router.get('/workspace/:workspaceId/my-timesheet', authenticate, asyncHandler(reportController.getMyTimesheet));
router.get('/workspace/:workspaceId/team', authenticate, asyncHandler(reportController.getTeamReport));
router.get('/workspace/:workspaceId/summary', authenticate, asyncHandler(reportController.getReportSummary));
router.get('/workspace/:workspaceId/export', authenticate, asyncHandler(reportController.exportReport));
router.post('/workspace/:workspaceId/email', authenticate, asyncHandler(reportController.emailReport));

// Saved report recipients
router.get('/workspace/:workspaceId/recipients', authenticate, asyncHandler(reportController.getRecipients));
router.post('/workspace/:workspaceId/recipients', authenticate, asyncHandler(reportController.addRecipient));
router.delete('/recipients/:recipientId', authenticate, asyncHandler(reportController.deleteRecipient));

export default router;
