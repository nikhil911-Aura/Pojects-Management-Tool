import express from 'express';
import timeTrackingController from './timeTrackingController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';

const router = express.Router();

router.get('/task/:taskId/entries', authenticate, asyncHandler(timeTrackingController.getEntries));
router.post('/task/:taskId/entries', authenticate, asyncHandler(timeTrackingController.addEntry));
router.put('/entries/:entryId', authenticate, asyncHandler(timeTrackingController.updateEntry));
router.delete('/entries/:entryId', authenticate, asyncHandler(timeTrackingController.deleteEntry));
router.post('/task/:taskId/timer/start', authenticate, asyncHandler(timeTrackingController.startTimer));
router.post('/task/:taskId/timer/stop', authenticate, asyncHandler(timeTrackingController.stopTimer));
router.get('/task/:taskId/timer', authenticate, asyncHandler(timeTrackingController.getTimerStatus));

export default router;
