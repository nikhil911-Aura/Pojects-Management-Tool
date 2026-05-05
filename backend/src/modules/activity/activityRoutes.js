import express from 'express';
import activityController from './activityController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';

const router = express.Router();

// Inbox
router.get('/workspace/:workspaceId/inbox', authenticate, asyncHandler(activityController.getInbox));
router.get('/workspace/:workspaceId/inbox/unread-count', authenticate, asyncHandler(activityController.getUnreadCount));
router.post('/workspace/:workspaceId/inbox/mark-seen', authenticate, asyncHandler(activityController.markSeen));

// Per-task activity
router.get('/task/:taskId', authenticate, asyncHandler(activityController.getByTask));

export default router;
