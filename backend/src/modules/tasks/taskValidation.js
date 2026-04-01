import { body, param, query } from 'express-validator';

export const createTaskValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Task title is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be less than 2000 characters'),
  body('status')
    .optional()
    .isIn(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
    .withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH'])
    .withMessage('Invalid priority (must be LOW, MEDIUM, or HIGH)'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid due date'),
  body('parentId')
    .optional()
    .isUUID()
    .withMessage('Invalid parent task ID')
];

export const updateTaskValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be less than 2000 characters'),
  body('status')
    .optional()
    .isIn(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
    .withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH'])
    .withMessage('Invalid priority (must be LOW, MEDIUM, or HIGH)'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid due date'),
  body('parentId')
    .optional()
    .isUUID()
    .withMessage('Invalid parent task ID')
];

export const moveTaskValidation = [
  body('listId')
    .isUUID()
    .withMessage('Invalid list ID'),
  body('position')
    .optional()
    .isFloat()
    .withMessage('Position must be a number')
];

export const assignUserValidation = [
  body('userId')
    .isUUID()
    .withMessage('Invalid user ID')
];

export const taskIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid task ID')
];

export const searchValidation = [
  query('q')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters')
];

export default {
  createTaskValidation,
  updateTaskValidation,
  moveTaskValidation,
  assignUserValidation,
  taskIdValidation,
  searchValidation
};
