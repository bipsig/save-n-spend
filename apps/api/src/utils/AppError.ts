import type { ApiErrorCode, ApiIssue } from "@save-n-spend/types";
import { duplicate, invalidReference } from "./messages";

/**
 * An error the API answers on purpose. `code` defaults from the status (see
 * middleware/errorHandler's `defaultCode`); set it when the default isn't the situation, e.g.
 * a body reference (400 `invalid_reference`) or a duplicate (409 `duplicate`).
 */
export class AppError extends Error {
  readonly code?: ApiErrorCode;
  readonly issues?: ApiIssue[];

  constructor(public statusCode: number, message: string, options: { code?: ApiErrorCode; issues?: ApiIssue[] } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = options.code;
    this.issues = options.issues;
  }

  static badRequest(message: string) { return new AppError(400, message); }
  static unauthorized(message = 'Unauthorized') { return new AppError(401, message); }
  static notFound(message: string) { return new AppError(404, message); }
  static conflict(message: string) { return new AppError(409, message); }

  /** A body field that names something that isn't one of the user's. `path` goes in `issues`,
   *  never in the sentence. */
  static invalidReference(path: string, label: string, things?: string) {
    const message = invalidReference(label, things);
    return new AppError(400, message, { code: 'invalid_reference', issues: [{ path, message }] });
  }

  /** e.g. `AppError.duplicate("a budget for this category this month")`. */
  static duplicate(thing: string) { return new AppError(409, duplicate(thing), { code: 'duplicate' }); }
}
