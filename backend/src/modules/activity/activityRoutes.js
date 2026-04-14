import express from 'express';
import activityController from './activityController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';

const router = express.Router();

// Inbox — workspace-wide notifications
router.get('/workspace/:workspaceId/inbox', authenticate, asyncHandler(activityController.getInbox));

// Per-task activity
router.get('/task/:taskId', authenticate, asyncHandler(activityController.getByTask));

export default router;
