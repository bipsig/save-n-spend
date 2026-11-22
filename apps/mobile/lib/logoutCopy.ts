// What the one logout sheet says (gaps row 105). Pure, so it runs under node:test.

export const LOGOUT_BASE = "Your data stays on the server. You'll need your password to sign back in.";

/** The sheet's body: what hasn't synced, what is still in its undo window, then the base. */
export const logoutBody = (unsynced: number, pendingDeletes: number): string => {
  const parts: string[] = [];
  if (unsynced > 0) {
    parts.push(`${unsynced} ${unsynced === 1 ? "transaction hasn't" : "transactions haven't"} synced yet. They'll sync once you're signed back in.`);
  }
  if (pendingDeletes > 0) parts.push(pendingDeletes === 1 ? "The delete you just made is sent first." : "The deletes you just made are sent first.");
  parts.push(LOGOUT_BASE);
  return parts.join(" ");
};
