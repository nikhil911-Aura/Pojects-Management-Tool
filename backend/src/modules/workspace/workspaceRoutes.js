import express from 'express';
import workspaceController from './workspaceController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  createWorkspaceValidation,
  updateWorkspaceValidation,
  inviteUserValidation,
  updateRoleValidation
} from './workspaceValidation.js';

const router = express.Router();

// Routes
router.post('/', authenticate, validate(createWorkspaceValidation), asyncHandler(workspaceController.create));
router.get('/', authenticate, asyncHandler(workspaceController.getAll));
router.get('/:id', authenticate, asyncHandler(workspaceController.getById));
router.put('/:id', authenticate, validate(updateWorkspaceValidation), asyncHandler(workspaceController.update));
router.delete('/:id', authenticate, asyncHandler(workspaceController.delete));

// Member & Invite management
router.post('/:id/invite', authenticate, validate(inviteUserValidation), asyncHandler(workspaceController.inviteUser));
router.get('/:id/invites', authenticate, asyncHandler(workspaceController.getInvites));
router.delete('/:id/members/:userId', authenticate, asyncHandler(workspaceController.removeUser));
router.put('/:id/members/:userId/role', authenticate, validate(updateRoleValidation), asyncHandler(workspaceController.updateMemberRole));

export default router;
