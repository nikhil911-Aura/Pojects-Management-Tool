import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

export const userService = {
  // Get all users (for workspace invite)
  async getAllUsers(query) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          createdAt: true
        },
        orderBy: { name: 'asc' }
      }),
      prisma.user.count({ where })
    ]);

    return {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  },

  // Get user by ID
  async getUserById(userId) {
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
  },

  // Update user profile
  async updateUser(userId, updateData) {
    const { name, avatar } = updateData;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(avatar && { avatar })
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        updatedAt: true
      }
    });

    return user;
  },

  // Get users by IDs
  async getUsersByIds(userIds) {
    return prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true
      }
    });
  }
};

export default userService;
