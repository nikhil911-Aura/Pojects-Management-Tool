import { validationResult } from 'express-validator';
import { ApiError } from '../utils/apiResponse.js';

export const validate = (validations) => {
  return async (req, res, next) => {
    for (let validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      req.validatedBody = req.body;
      req.validatedQuery = req.query;
      req.validatedParams = req.params;
      return next();
    }

    const extractedErrors = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));

    throw ApiError.badRequest('Validation failed', extractedErrors);
  };
};
