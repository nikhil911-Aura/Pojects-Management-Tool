import express from 'express';
import customFieldController from './customFieldController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';

const router = express.Router();

// Project custom fields
router.get('/project/:projectId', authenticate, asyncHandler(customFieldController.getByProject));
router.post('/project/:projectId', authenticate, asyncHandler(customFieldController.create));
router.get('/project/:projectId/values', authenticate, asyncHandler(customFieldController.getValues));

// Individual field operations
router.put('/:fieldId', authenticate, asyncHandler(customFieldController.update));
router.delete('/:fieldId', authenticate, asyncHandler(customFieldController.delete));

// Set value for a task
router.put('/:fieldId/task/:taskId', authenticate, asyncHandler(customFieldController.setValue));

export default router;
