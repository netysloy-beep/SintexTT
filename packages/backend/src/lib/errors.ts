export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, msg: string) => new AppError(400, code, msg);
export const unauthorized = (code: string, msg: string) => new AppError(401, code, msg);
export const forbidden = (code: string, msg: string) => new AppError(403, code, msg);
export const notFound = (code: string, msg: string) => new AppError(404, code, msg);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
export const tooMany = (code: string, msg: string) => new AppError(429, code, msg);
