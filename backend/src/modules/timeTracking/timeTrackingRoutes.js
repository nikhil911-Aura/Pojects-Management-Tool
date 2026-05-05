import express from 'express';
import { body, param } from 'express-validator';
import timeTrackingController from './timeTrackingController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';

const router = express.Router();

const taskIdValidation = [
  param('taskId').isUUID().withMessage('Invalid task ID'),
];

const entryIdValidation = [
  param('entryId').isUUID().withMessage('Invalid entry ID'),
];

const addEntryValidation = [
  body('minutes')
    .notEmpty().withMessage('minutes is required')
    .isInt({ min: 1 }).withMessage('minutes must be a positive integer (≥ 1)'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Note must be at most 500 characters'),
  body('date')
    .optional()
    .isISO8601().withMessage('date must be a valid ISO 8601 date'),
];

const updateEntryValidation = [
  body('minutes')
    .optional()
    .isInt({ min: 1 }).withMessage('minutes must be a positive integer (≥ 1)'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Note must be at most 500 characters'),
  body('date')
    .optional()
    .isISO8601().withMessage('date must be a valid ISO 8601 date'),
];

router.get('/task/:taskId/entries', authenticate, validate(taskIdValidation), asyncHandler(timeTrackingController.getEntries));
router.post('/task/:taskId/entries', authenticate, validate(taskIdValidation), validate(addEntryValidation), asyncHandler(timeTrackingController.addEntry));
router.put('/entries/:entryId', authenticate, validate(entryIdValidation), validate(updateEntryValidation), asyncHandler(timeTrackingController.updateEntry));
router.delete('/entries/:entryId', authenticate, validate(entryIdValidation), asyncHandler(timeTrackingController.deleteEntry));
router.post('/task/:taskId/timer/start', authenticate, validate(taskIdValidation), asyncHandler(timeTrackingController.startTimer));
router.post('/task/:taskId/timer/stop', authenticate, validate(taskIdValidation), asyncHandler(timeTrackingController.stopTimer));
router.get('/task/:taskId/timer', authenticate, validate(taskIdValidation), asyncHandler(timeTrackingController.getTimerStatus));

export default router;
