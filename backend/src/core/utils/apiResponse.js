export class ApiError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = null) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

export const apiResponse = (res, statusCode, success, data = null, message = null, errors = null) => {
  const response = {
    success,
    ...(data && { data }),
    ...(message && { message }),
    ...(errors && { error: errors })
  };
  return res.status(statusCode).json(response);
};

export const successResponse = (res, data = null, message = 'Success') => {
  return apiResponse(res, 200, true, data, message);
};

export const createdResponse = (res, data = null, message = 'Created successfully') => {
  return apiResponse(res, 201, true, data, message);
};

export const errorResponse = (res, statusCode, message, errors = null) => {
  return apiResponse(res, statusCode, false, null, message, errors);
};
