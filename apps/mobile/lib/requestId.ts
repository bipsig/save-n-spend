// The phone's half of request references — same alphabet and length as the API's
// utils/requestId, which only trusts an incoming id of exactly this shape. No 0/O, 1/I/L, so
// "Ref 7K2QXB" can be read back over a message without guessing.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const makeRequestId = (): string => {
  let id = "";
  for (let i = 0; i < 6; i++) id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return id;
};

/** `/investments/6a76…c688/basis?mode=keep` → `/investments/:id/basis` — what the log and the
 *  Diagnostics list show, without the ids or the query. */
export const routePattern = (path: string): string =>
  path.split("?")[0].replace(/\/[a-f0-9]{24}(?=\/|$)/gi, "/:id") || "/";
