import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';

// Every error body carries the request's reference, so the message the app shows can end in
// "Ref 7K2QXB" and that reference finds this exact request in the logs. The message (and, for a
// 500, the stack) is handed to the request logger through res.locals rather than logged here,
// so each request is still exactly one log line.
const fail = (res: Response, statusCode: number, message: string) => {
  res.locals.errorMessage = message;
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    data: null,
    requestId: res.locals.requestId ?? null,
  });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {

  if (err instanceof AppError) {
    return fail(res, err.statusCode, err.message);
  }

  // Zod validation failure
  if (err instanceof ZodError) {
    return fail(res, 400, err.errors[0].message);
  }

  // Mongoose: invalid ObjectId (e.g. /users/not-an-id)
  if (err instanceof mongoose.Error.CastError) {
    return fail(res, 400, `Invalid ${err.path}`);
  }

  // Mongoose: schema validation
  if (err instanceof mongoose.Error.ValidationError) {
    const message = Object.values(err.errors).map(e => e.message).join(', ');
    return fail(res, 400, message);
  }

  // MongoDB: duplicate key (e.g. duplicate email)
  if ((err as NodeJS.ErrnoException & { code?: number }).code === 11000) {
    return fail(res, 409, 'A record with this value already exists');
  }

  // Unexpected error — the real message and stack go to the log, never to the client.
  res.locals.errorStack = err.stack ?? String(err);
  fail(res, 500, 'Something went wrong. Please try again.');
  res.locals.errorMessage = err.message;
};
