import logger from '../logger/index.js';
import { ApiError, apiResponse } from '../utils/apiResponse.js';

export const errorHandler = (err, req, res, next) => {
  let error = err;
  
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // If it's not an ApiError, create one
  if (!(err instanceof ApiError)) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';
    error = new ApiError(statusCode, message);
  }

  // Send response
  const response = {
    success: false,
    message: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };

  return res.status(error.statusCode).json(response);
};
