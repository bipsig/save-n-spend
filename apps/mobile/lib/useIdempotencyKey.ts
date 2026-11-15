import { useRef } from "react";
import { createKeyHolder, type KeyHolder } from "@/lib/idempotency";

/** A key holder for one mount of a full-screen form whose values don't survive a reopen
 *  (a new entry starts blank). Sheets and forms that reopen with the same values use
 *  `holderFor(scope)` instead (see lib/idempotency.ts). */
export const useIdempotencyKey = (): KeyHolder => {
  const ref = useRef<KeyHolder | null>(null);
  if (!ref.current) ref.current = createKeyHolder();
  return ref.current;
};
