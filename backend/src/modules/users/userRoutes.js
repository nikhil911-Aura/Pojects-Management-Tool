import express from 'express';
import userController from './userController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import { updateUserValidation, getUsersValidation } from './userValidation.js';
import { uploadAvatar } from '../../core/cloudinary.js';

const router = express.Router();

// Routes
router.get('/', authenticate, validate(getUsersValidation), asyncHandler(userController.getAllUsers));
router.put('/profile', authenticate, validate(updateUserValidation), asyncHandler(userController.updateUser));
router.post('/profile/avatar', authenticate, uploadAvatar.single('avatar'), asyncHandler(userController.uploadAvatar));
router.get('/:id', authenticate, asyncHandler(userController.getUserById));

export default router;
