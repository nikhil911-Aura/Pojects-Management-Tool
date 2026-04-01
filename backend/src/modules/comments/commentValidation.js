import { body, param } from 'express-validator';

export const createCommentValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters')
];

export const updateCommentValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters')
];

export const commentIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid comment ID')
];

export default {
  createCommentValidation,
  updateCommentValidation,
  commentIdValidation
};
