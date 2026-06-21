import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export const protect = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(AppError.unauthorized("Token is missing"));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  try {
    const payload = jwt.verify(token, secret) as Express.Request["user"];
    req.user = payload;
    next();
  }
  catch (err) {
    next(AppError.unauthorized("Invalid or expired token"));
  }

}