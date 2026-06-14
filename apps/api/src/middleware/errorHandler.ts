import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      data: null,
    });
  }

  // Zod validation failure
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: err.errors[0].message,
      data: null,
    });
  }

  // Mongoose: invalid ObjectId (e.g. /users/not-an-id)
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: `Invalid ${err.path}: ${err.value}`,
      data: null,
    });
  }

  // Mongoose: schema validation
  if (err instanceof mongoose.Error.ValidationError) {
    const message = Object.values(err.errors).map(e => e.message).join(', ');
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message,
      data: null,
    });
  }

  // MongoDB: duplicate key (e.g. duplicate email)
  if ((err as NodeJS.ErrnoException & { code?: number }).code === 11000) {
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: 'A record with this value already exists',
      data: null,
    });
  }

  // Unexpected error — log it, never leak details
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    statusCode: 500,
    message: 'Something went wrong. Please try again.',
    data: null,
  });
};
