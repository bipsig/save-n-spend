// What a response may carry of a stored document. The apps read none of these fields (checked
// in .audit/api-consistency-audit.md → "Fields the app never reads"), so dropping them is safe
// for 2.6.0 onwards; nothing else about the document changes.
export const INTERNAL_FIELDS = ["__v", "userId", "pushToken", "googleId", "totpEnabled", "authProvider", "deactivatedAt"] as const;
export type InternalField = (typeof INTERNAL_FIELDS)[number];

type JsonDoc<T> = { toJSON(): T };

/**
 * A Mongoose document or a lean object, minus the internal fields, top level only. A document
 * goes through its own `toJSON()` first (so a schema transform, like User's password removal,
 * still applies), which is exactly what `res.json(doc)` sends today.
 */
export const toDTO = <T extends object>(doc: T | JsonDoc<T>): Omit<T, InternalField> => {
    const plain = { ...(typeof (doc as JsonDoc<T>).toJSON === "function" ? (doc as JsonDoc<T>).toJSON() : doc) } as Record<string, unknown>;
    for (const field of INTERNAL_FIELDS) delete plain[field];
    return plain as Omit<T, InternalField>;
};

export const toDTOs = <T extends object>(docs: (T | JsonDoc<T>)[]): Omit<T, InternalField>[] => docs.map((d) => toDTO(d));
