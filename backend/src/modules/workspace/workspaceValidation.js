import { body } from 'express-validator';

export const createWorkspaceValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Workspace name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon must be less than 50 characters')
];

export const updateWorkspaceValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon must be less than 50 characters')
];

export const inviteUserValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['ADMIN', 'MEMBER', 'GUEST'])
    .withMessage('Invalid role')
];

export const updateRoleValidation = [
  body('userId')
    .isUUID()
    .withMessage('Invalid user ID'),
  body('role')
    .isIn(['ADMIN', 'MEMBER', 'GUEST'])
    .withMessage('Invalid role')
];

export default {
  createWorkspaceValidation,
  updateWorkspaceValidation,
  inviteUserValidation,
  updateRoleValidation
};
