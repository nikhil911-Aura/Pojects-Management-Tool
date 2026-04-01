import { body, query } from 'express-validator';

export const getUsersValidation = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Search query too long'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const updateUserValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL')
];

export default {
  getUsersValidation,
  updateUserValidation
};
