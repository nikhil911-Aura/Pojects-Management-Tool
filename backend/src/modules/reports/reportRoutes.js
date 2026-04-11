import express from 'express';
import reportController from './reportController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';

const router = express.Router();

router.get('/workspace/:workspaceId/my-timesheet', authenticate, reportController.getMyTimesheet);
router.get('/workspace/:workspaceId/team', authenticate, reportController.getTeamReport);
router.get('/workspace/:workspaceId/summary', authenticate, reportController.getReportSummary);
router.get('/workspace/:workspaceId/export', authenticate, reportController.exportReport);
router.post('/workspace/:workspaceId/email', authenticate, reportController.emailReport);

export default router;