// Idempotency keys: one per user intent, so a retry after a lost reply (a double tap, a
// re-tap after an error, an outbox replay) can't apply the same write twice. The server
// answers a repeated key + body with the first reply. Pure, so it's tested under node.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 26 characters: time first so keys sort by creation, then 18 random. Also a valid
 *  transaction `clientId` (8–64 characters). */
export const makeIdempotencyKey = (): string => {
  let random = "";
  for (let i = 0; i < 18; i++) random += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${Date.now().toString(36).padStart(8, "0")}${random}`;
};

/** JSON with object keys sorted, so two bodies with the same values sign the same. */
export const stableStringify = (value: unknown): string => {
  if (value === undefined) return "";
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v);
};

export type KeyHolder = {
  /** The key for this exact request. The same method, path and body get the same key until
   *  `reset`; a changed value is a new intent and gets a new key. */
  keyFor: (method: string, path: string, body?: unknown) => string;
  /** Call after a success and when the form opens again. */
  reset: () => void;
};

export const createKeyHolder = (make: () => string = makeIdempotencyKey): KeyHolder => {
  // The first request after a reset takes the key made when the form opened.
  let fresh = make();
  let keys = new Map<string, string>();
  return {
    keyFor: (method, path, body) => {
      const signature = `${method} ${path} ${stableStringify(body)}`;
      let key = keys.get(signature);
      if (!key) {
        key = fresh || make();
        fresh = "";
        keys.set(signature, key);
      }
      return key;
    },
    reset: () => {
      fresh = make();
      keys = new Map();
    },
  };
};

// One holder per target for the life of the app run, so closing a sheet and reopening it on
// the same bill, goal, account or trip with the same values sends the same key, and a lost
// reply can't become a duplicate. `reset()` after a success clears that target only.
const scoped = new Map<string, KeyHolder>();

/** The holder for a target: `holderFor(\`goal:${id}:contribute\`)`, `holderFor("bill:new")`. */
export const holderFor = (scope: string): KeyHolder => {
  let holder = scoped.get(scope);
  if (!holder) {
    holder = createKeyHolder();
    scoped.set(scope, holder);
  }
  return holder;
};
