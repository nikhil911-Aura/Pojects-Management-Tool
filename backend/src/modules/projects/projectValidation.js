import { body, param } from 'express-validator';

export const createProjectValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Project name is required')
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
    .isLength({ max: 50 }),
  body('color')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Color must be less than 20 characters'),
  body('views')
    .optional()
    .isArray()
    .withMessage('Views must be an array'),
  body('visibility')
    .optional()
    .isIn(['PUBLIC', 'PRIVATE'])
    .withMessage('Invalid visibility')
];

export const updateProjectValidation = [
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
    .isLength({ max: 50 }),
  body('color')
    .optional()
    .trim()
    .isLength({ max: 20 }),
  body('visibility')
    .optional()
    .isIn(['PUBLIC', 'PRIVATE'])
    .withMessage('Invalid visibility')
];

export const addMemberValidation = [
  body('userId')
    .isUUID()
    .withMessage('Invalid user ID'),
  body('role')
    .optional()
    .isIn(['ADMIN', 'MEMBER', 'GUEST'])
    .withMessage('Invalid role')
];

export const projectIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid project ID')
];

export default {
  createProjectValidation,
  updateProjectValidation,
  addMemberValidation,
  projectIdValidation
};
