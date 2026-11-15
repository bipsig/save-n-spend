export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        name: string;
        email: string;
        loginTime: string;
      };
      /** Set by middleware/validate. Cast with its `Valid<typeof schemas>`. */
      valid?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}
