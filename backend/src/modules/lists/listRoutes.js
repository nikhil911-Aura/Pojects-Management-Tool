import express from 'express';
import listController from './listController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  createListValidation,
  updateListValidation,
  reorderListsValidation,
  boardIdValidation,
  listIdValidation
} from './listValidation.js';

const router = express.Router();

// Routes
router.post('/board/:boardId', authenticate, validate(boardIdValidation), validate(createListValidation), asyncHandler(listController.create));
router.get('/board/:boardId', authenticate, validate(boardIdValidation), asyncHandler(listController.getAll));
router.put('/:id', authenticate, validate(listIdValidation), validate(updateListValidation), asyncHandler(listController.update));
router.delete('/:id', authenticate, validate(listIdValidation), asyncHandler(listController.delete));
router.put('/board/:boardId/reorder', authenticate, validate(boardIdValidation), validate(reorderListsValidation), asyncHandler(listController.reorder));

export default router;
