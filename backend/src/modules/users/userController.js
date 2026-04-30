import userService from './userService.js';
import { successResponse } from '../../core/utils/apiResponse.js';

export const userController = {
  // Get all users
  async getAllUsers(req, res, next) {
    const result = await userService.getAllUsers(req.query);
    return successResponse(res, result);
  },

  // Get user by ID
  async getUserById(req, res, next) {
    const user = await userService.getUserById(req.params.id);
    return successResponse(res, user);
  },

  // Update user profile
  async updateUser(req, res, next) {
    const user = await userService.updateUser(req.user.id, req.validatedBody);
    return successResponse(res, user, 'Profile updated successfully');
  },

  // Upload avatar to Cloudinary
  async uploadAvatar(req, res, next) {
    if (!req.file) throw { status: 400, message: 'No file uploaded' };
    const avatarUrl = req.file.path;
    const user = await userService.updateUser(req.user.id, { avatar: avatarUrl });
    return successResponse(res, user, 'Avatar updated successfully');
  }
};

export default userController;
