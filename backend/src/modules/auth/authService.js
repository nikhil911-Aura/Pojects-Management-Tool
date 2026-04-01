import prisma from '../../core/database/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../core/config/index.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const authService = {
  // Register new user
  async register(userData) {
    const { email, password, name } = userData;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw ApiError.conflict('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true
      }
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id);

    return { user, ...tokens };
  },

  // Login user
  async login(userData) {
    const { email, password } = userData;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, ...tokens };
  },

  // Refresh token
  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token required');
    }

    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      
      if (!decoded || !decoded.userId) {
        throw ApiError.unauthorized('Invalid refresh token payload');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        throw ApiError.unauthorized('User not found');
      }

      // Check if token matches stored token
      if (user.refreshToken !== refreshToken) {
        throw ApiError.unauthorized('Invalid refresh token');
      }

      const tokens = await this.generateTokens(user.id);

      return tokens;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized('Invalid refresh token');
      }
      throw error;
    }
  },

  // Logout
  async logout(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExp: null
      }
    });

    return true;
  },

  // Generate access and refresh tokens
  async generateTokens(userId) {
    const accessToken = jwt.sign(
      { userId },
      config.jwt.secret,
      { expiresIn: config.jwt.expire }
    );

    const refreshToken = jwt.sign(
      { userId },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpire }
    );

    // Store refresh token
    const refreshTokenExp = new Date();
    refreshTokenExp.setDate(refreshTokenExp.getDate() + 7);

    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken,
        refreshTokenExp
      }
    });

    return { accessToken, refreshToken };
  },

  // Get current user
  async getCurrentUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    return user;
  }
};

export default authService;
