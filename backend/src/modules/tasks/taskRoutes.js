import express from 'express';
import taskController from './taskController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  createTaskValidation,
  updateTaskValidation,
  moveTaskValidation,
  assignUserValidation,
  taskIdValidation,
  searchValidation
} from './taskValidation.js';

import { upload } from '../../core/cloudinary.js';

const router = express.Router();

// Search — MUST be before /:id to avoid route conflict
router.get('/workspace/:workspaceId/search', authenticate, validate(searchValidation), asyncHandler(taskController.search));

// My Tasks — all tasks assigned to the current user
router.get('/workspace/:workspaceId/my-tasks', authenticate, asyncHandler(taskController.getMyTasks));

// CRUD
router.post('/list/:listId', authenticate, validate(createTaskValidation), asyncHandler(taskController.create));
router.get('/:id', authenticate, validate(taskIdValidation), asyncHandler(taskController.getById));
router.put('/:id', authenticate, validate(taskIdValidation), validate(updateTaskValidation), asyncHandler(taskController.update));
router.delete('/:id', authenticate, validate(taskIdValidation), asyncHandler(taskController.delete));

// Attachments
router.post('/:id/attachments', authenticate, validate(taskIdValidation), upload.single('file'), asyncHandler(taskController.addAttachment));
router.delete('/:id/attachments/:attachmentId', authenticate, validate(taskIdValidation), asyncHandler(taskController.removeAttachment));

// Move task
router.put('/:id/move', authenticate, validate(taskIdValidation), validate(moveTaskValidation), asyncHandler(taskController.moveTask));

// Multi-project milestones
router.get('/:id/milestone-projects', authenticate, validate(taskIdValidation), asyncHandler(taskController.getMilestoneProjects));
router.post('/:id/milestone-projects', authenticate, validate(taskIdValidation), asyncHandler(taskController.addMilestoneToProject));
router.delete('/:id/milestone-projects/:projectId', authenticate, validate(taskIdValidation), asyncHandler(taskController.removeMilestoneFromProject));

// Assignees
router.post('/:id/assignees', authenticate, validate(taskIdValidation), validate(assignUserValidation), asyncHandler(taskController.assignUser));
router.put('/:id/assignees/reassign', authenticate, validate(taskIdValidation), asyncHandler(taskController.reassignUser));
router.delete('/:id/assignees/:assigneeId', authenticate, validate(taskIdValidation), asyncHandler(taskController.removeAssignee));

export default router;
