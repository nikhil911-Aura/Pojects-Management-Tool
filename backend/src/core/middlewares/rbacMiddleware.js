import { ApiError } from '../utils/apiResponse.js';

export const rbacMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }

    next();
  };
};

// Helper to check workspace roles
export const checkWorkspaceRole = (userRole, requiredRoles) => {
  const roleHierarchy = {
    OWNER: 3,
    ADMIN: 2,
    MEMBER: 1,
    GUEST: 0
  };

  const userLevel = roleHierarchy[userRole] || 0;
  
  return requiredRoles.some(role => userLevel >= roleHierarchy[role]);
};
