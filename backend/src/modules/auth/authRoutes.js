import express from 'express';
import authController from './authController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  registerValidation,
  loginValidation,
  refreshTokenValidation
} from './authValidation.js';

const router = express.Router();

// Routes
router.post('/register', validate(registerValidation), asyncHandler(authController.register));
router.post('/login', validate(loginValidation), asyncHandler(authController.login));
router.post('/refresh-token', validate(refreshTokenValidation), asyncHandler(authController.refreshToken));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.getCurrentUser));

export default router;
