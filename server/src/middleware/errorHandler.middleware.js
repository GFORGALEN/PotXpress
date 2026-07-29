import { ZodError } from 'zod';
import { AppError } from '../utils/appError.js';
import { fail } from '../utils/response.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ZodError) {
    return fail(
      res,
      400,
      'VALIDATION_ERROR',
      '请求参数不正确',
      {
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      },
    );
  }

  if (error instanceof AppError) {
    return fail(
      res,
      error.status,
      error.code,
      error.message,
      error.details,
    );
  }

  console.error('未处理的服务器错误：', error);
  return fail(res, 500, 'INTERNAL_ERROR', '服务器内部错误');
}
