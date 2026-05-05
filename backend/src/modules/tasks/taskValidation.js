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
  body('estimatedTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Estimated time must be a positive number (minutes)'),
  body('actualTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Actual time must be a positive number (minutes)'),
  body('taskType')
    .optional()
    .isIn(['DEFAULT_TASK', 'MILESTONE', 'APPROVAL'])
    .withMessage('Invalid task type'),
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
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('Invalid due date'),
  body('estimatedTime')
    .optional({ values: 'null' })
    .isInt({ min: 0 })
    .withMessage('Estimated time must be a positive number (minutes)'),
  body('actualTime')
    .optional({ values: 'null' })
    .isInt({ min: 0 })
    .withMessage('Actual time must be a positive number (minutes)'),
  body('taskType')
    .optional()
    .isIn(['DEFAULT_TASK', 'MILESTONE', 'APPROVAL'])
    .withMessage('Invalid task type'),
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
    .optional({ values: 'undefined' })
    .isFloat()
    .withMessage('Position must be a number'),
  // parentId may be: a UUID string (becomes a subtask), null (becomes top-level), or omitted (no change)
  body('parentId')
    .custom((value) => {
      if (value === undefined || value === null) return true;
      if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return true;
      throw new Error('parentId must be a UUID string or null');
    })
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
