import express from 'express';
import { body, param } from 'express-validator';
import customFieldController from './customFieldController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';

const router = express.Router();

const VALID_FIELD_TYPES = ['TEXT', 'NUMBER', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'PEOPLE', 'CHECKBOX', 'TIME_TRACKING'];

const createFieldValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Field name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Field name must be 1–100 characters'),
  body('type')
    .optional()
    .isIn(VALID_FIELD_TYPES)
    .withMessage(`Field type must be one of: ${VALID_FIELD_TYPES.join(', ')}`),
];

const updateFieldValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Field name cannot be empty')
    .isLength({ min: 1, max: 100 }).withMessage('Field name must be 1–100 characters'),
  body('type')
    .optional()
    .isIn(VALID_FIELD_TYPES)
    .withMessage(`Field type must be one of: ${VALID_FIELD_TYPES.join(', ')}`),
];

const projectIdValidation = [
  param('projectId').isUUID().withMessage('Invalid project ID'),
];

const fieldIdValidation = [
  param('fieldId').isUUID().withMessage('Invalid field ID'),
];

// Project custom fields
router.get('/project/:projectId', authenticate, validate(projectIdValidation), asyncHandler(customFieldController.getByProject));
router.post('/project/:projectId', authenticate, validate(projectIdValidation), validate(createFieldValidation), asyncHandler(customFieldController.create));
router.get('/project/:projectId/values', authenticate, validate(projectIdValidation), asyncHandler(customFieldController.getValues));

// Individual field operations
router.put('/:fieldId', authenticate, validate(fieldIdValidation), validate(updateFieldValidation), asyncHandler(customFieldController.update));
router.delete('/:fieldId', authenticate, validate(fieldIdValidation), asyncHandler(customFieldController.delete));

// Set value for a task
router.put('/:fieldId/task/:taskId', authenticate, validate(fieldIdValidation), asyncHandler(customFieldController.setValue));

export default router;
