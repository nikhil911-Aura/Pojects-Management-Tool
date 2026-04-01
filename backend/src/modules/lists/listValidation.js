import { body, param } from 'express-validator';

export const createListValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('List name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
];

export const updateListValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('position')
    .optional()
    .isFloat()
    .withMessage('Position must be a number')
];

export const reorderListsValidation = [
  body('listIds')
    .isArray()
    .withMessage('listIds must be an array')
    .notEmpty()
    .withMessage('listIds cannot be empty')
];

export const boardIdValidation = [
  param('boardId')
    .isUUID()
    .withMessage('Invalid board ID')
];

export const listIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid list ID')
];

export default {
  createListValidation,
  updateListValidation,
  reorderListsValidation,
  boardIdValidation,
  listIdValidation
};
