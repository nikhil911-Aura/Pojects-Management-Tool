import express from 'express';
import commentController from './commentController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  createCommentValidation,
  updateCommentValidation,
  commentIdValidation
} from './commentValidation.js';

const router = express.Router();

// Routes
router.post('/task/:taskId', authenticate, validate(createCommentValidation), asyncHandler(commentController.create));
router.get('/task/:taskId', authenticate, asyncHandler(commentController.getByTask));
router.put('/:id', authenticate, validate(commentIdValidation), validate(updateCommentValidation), asyncHandler(commentController.update));
router.delete('/:id', authenticate, validate(commentIdValidation), asyncHandler(commentController.delete));

export default router;
