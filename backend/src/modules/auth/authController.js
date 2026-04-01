import authService from './authService.js';
import { successResponse, createdResponse } from '../../core/utils/apiResponse.js';

export const authController = {
  // Register
  async register(req, res, next) {
    const result = await authService.register(req.validatedBody);
    return createdResponse(res, result, 'Registration successful');
  },

  // Login
  async login(req, res, next) {
    const result = await authService.login(req.validatedBody);
    return successResponse(res, result, 'Login successful');
  },

  // Refresh token
  async refreshToken(req, res, next) {
    const { refreshToken } = req.validatedBody;
    const result = await authService.refreshToken(refreshToken);
    return successResponse(res, result, 'Token refreshed');
  },

  // Logout
  async logout(req, res, next) {
    await authService.logout(req.user.id);
    return successResponse(res, null, 'Logout successful');
  },

  // Get current user
  async getCurrentUser(req, res, next) {
    const user = await authService.getCurrentUser(req.user.id);
    return successResponse(res, user);
  }
};

export default authController;
