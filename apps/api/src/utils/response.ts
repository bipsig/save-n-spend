import { Response } from 'express';

const send = (
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data: unknown = null
) => {
  res.status(statusCode).json({ success, statusCode, message, data });
};

export const ok = (res: Response, data: unknown, message = 'Success') => send(res, 200, true, message, data);
export const created = (res: Response, data: unknown, message = 'Created successfully') => send(res, 201, true, message, data);
export const noContent = (res: Response, message = 'Deleted successfully') => send(res, 200, true, message, null);

export const badRequest = (res: Response, message = 'Bad request') => send(res, 400, false, message);
export const unauthorized = (res: Response, message = 'Unauthorized') => send(res, 401, false, message);
export const forbidden = (res: Response, message = 'Forbidden') => send(res, 403, false, message);
export const notFound = (res: Response, message = 'Not found') => send(res, 404, false, message);
export const conflict = (res: Response, message = 'Already exists') => send(res, 409, false, message);
export const serverError = (res: Response, message = 'Internal server error') => send(res, 500, false, message);
