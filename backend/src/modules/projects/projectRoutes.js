import express from 'express';
import projectController from './projectController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  createProjectValidation,
  updateProjectValidation,
  addMemberValidation,
  projectIdValidation
} from './projectValidation.js';

const router = express.Router();

// Routes
router.post('/workspace/:workspaceId', authenticate, validate(createProjectValidation), asyncHandler(projectController.create));
router.get('/workspace/:workspaceId', authenticate, asyncHandler(projectController.getAll));
router.get('/:id', authenticate, validate(projectIdValidation), asyncHandler(projectController.getById));
router.put('/:id', authenticate, validate(projectIdValidation), validate(updateProjectValidation), asyncHandler(projectController.update));
router.delete('/:id', authenticate, validate(projectIdValidation), asyncHandler(projectController.delete));

// Member management
router.post('/:id/members', authenticate, validate(projectIdValidation), validate(addMemberValidation), asyncHandler(projectController.addMember));
router.put('/:id/members/:memberId/role', authenticate, validate(projectIdValidation), asyncHandler(projectController.updateMemberRole));
router.delete('/:id/members/:memberId', authenticate, validate(projectIdValidation), asyncHandler(projectController.removeMember));

export default router;
