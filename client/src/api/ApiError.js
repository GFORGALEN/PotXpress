export class ApiError extends Error {
  constructor({
    code = 'UNKNOWN_ERROR',
    message = '请求失败，请稍后再试',
    details,
    status = 0,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}
