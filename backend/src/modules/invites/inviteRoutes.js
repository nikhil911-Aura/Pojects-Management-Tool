import express from 'express';
import inviteController from './inviteController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';

const router = express.Router();

/**
 * Public routes (only validation)
 */
router.get('/validate/:token', asyncHandler(inviteController.validateToken));

/**
 * Authenticated routes
 */
router.post('/accept/:token', authenticate, asyncHandler(inviteController.acceptInvite));
router.post('/:id/resend', authenticate, asyncHandler(inviteController.resendInvite));
router.delete('/:id/cancel', authenticate, asyncHandler(inviteController.cancelInvite));

export default router;
