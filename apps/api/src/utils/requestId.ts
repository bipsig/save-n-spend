import { randomBytes } from "crypto";

// Six characters a person can read back over a message: no 0/O, 1/I/L. 31 symbols, so
// 31⁶ ≈ 890 million ids — plenty for a week of logs, short enough to say "Ref 7K2QXB".
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REQUEST_ID_LENGTH = 6;

export const makeRequestId = (): string => {
    const bytes = randomBytes(REQUEST_ID_LENGTH);
    let id = "";
    for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
    return id;
};

/** An id the phone sent is only trusted if it has exactly this shape — so a header can't
 *  be used to write arbitrary text into the log. */
export const isRequestId = (value: unknown): value is string =>
    typeof value === "string" && new RegExp(`^[${ALPHABET}]{${REQUEST_ID_LENGTH}}$`).test(value);
