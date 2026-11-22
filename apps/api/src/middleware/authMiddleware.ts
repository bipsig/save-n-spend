import jwt from "jsonwebtoken";
import { isValidObjectId } from "mongoose";
import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { AppError } from "../utils/AppError";

export const AUTH_MESSAGES = {
  signIn: "Please sign in again",
  sessionEnded: "Your session has ended. Please sign in again",
  closed: "This account was closed. Sign in to reopen it",
} as const;

// Explicit, because a 401 under /auth/change-password would otherwise default to
// invalid_credentials.
const unauthenticated = (message: string) => new AppError(401, message, { code: "unauthenticated" });

/**
 * A valid token for a user that still exists and isn't closed. One primary-key read per
 * request: without it a token issued before the account was closed (or for a user that is
 * gone) kept working everywhere but /auth/me. A failed read is passed on as the error it is
 * (a 500), never as a 401, so a database hiccup can't sign anyone out.
 */
export const protect = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(unauthenticated(AUTH_MESSAGES.signIn));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error("JWT_SECRET is not defined"));
  }

  let payload: (Express.Request["user"] & { iat?: number }) | undefined;
  try {
    payload = jwt.verify(token, secret) as typeof payload;
  }
  catch {
    return next(unauthenticated(AUTH_MESSAGES.sessionEnded));
  }

  if (!payload || !isValidObjectId(payload.userId)) {
    return next(unauthenticated(AUTH_MESSAGES.sessionEnded));
  }

  let user: { deactivatedAt?: Date | null; tokensValidAfter?: Date | null; tokenKept?: string | null } | null;
  try {
    user = await User.findById(payload.userId).select("deactivatedAt tokensValidAfter tokenKept").lean();
  }
  catch (err) {
    return next(err);
  }

  if (!user) {
    return next(unauthenticated(AUTH_MESSAGES.signIn));
  }
  if (user.deactivatedAt) {
    return next(unauthenticated(AUTH_MESSAGES.closed));
  }
  if (isRevoked(payload, user)) {
    return next(unauthenticated(AUTH_MESSAGES.sessionEnded));
  }

  req.user = payload;
  next();
}

/** When a token was issued: its signed `loginTime` (to the millisecond, set by
 *  generateAccessToken in every token since 2.6), else `iat` (whole seconds). */
const issuedAt = (token: { iat?: number; loginTime?: string }): number => {
  const login = typeof token.loginTime === "string" ? Date.parse(token.loginTime) : NaN;
  if (!Number.isNaN(login)) return login;
  return typeof token.iat === "number" ? token.iat * 1000 : NaN;
};

/**
 * A token issued before the user's cutoff (password change, deactivation), unless it is the
 * session that changed the password. Fails closed: once a cutoff exists, a token with no
 * readable issue time is revoked.
 */
export const isRevoked = (
  token: { iat?: number; loginTime?: string },
  user: { tokensValidAfter?: Date | null; tokenKept?: string | null },
): boolean => {
  if (!user.tokensValidAfter) return false;
  if (user.tokenKept && token.loginTime === user.tokenKept) return false;
  const issued = issuedAt(token);
  return Number.isNaN(issued) || issued < new Date(user.tokensValidAfter).getTime();
};
