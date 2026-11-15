import mongoose, { Document, Schema } from "mongoose";

// One row per `Idempotency-Key` a user sent (middleware/idempotency). The claim is inserted
// before the handler runs; `committed` is set INSIDE the write's own transaction (utils/
// inTransaction), so it is true exactly when the write landed, even if the server died before
// `reply` was stored. A row that is not committed can be taken over once `lockedUntil` passes;
// the `attempt` it was taken with is part of that marker's filter, so a slow first attempt can
// no longer commit after a retry has taken over.
export interface IIdempotencyRecord extends Document {
    userId: mongoose.Types.ObjectId;
    key: string;
    /** Method and route pattern, e.g. `POST /api/v1/bills/:id/pay`. */
    route: string;
    /** sha256 of the path parameters, query and body as sent. */
    bodyHash: string;
    status: "in_progress" | "done";
    committed: boolean;
    attempt: string;
    lockedUntil: Date;
    statusCode: number | null;
    /** The reply as sent, JSON text, so a replay is byte-for-byte the same. */
    body: string | null;
    createdAt: Date;
}

/** How long a key is remembered. */
export const IDEMPOTENCY_TTL_SECONDS = 90 * 24 * 60 * 60;

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    route: { type: String, required: true },
    bodyHash: { type: String, required: true },
    status: { type: String, enum: ["in_progress", "done"], required: true },
    committed: { type: Boolean, default: false },
    attempt: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
    statusCode: { type: Number, default: null },
    body: { type: String, default: null },
    createdAt: { type: Date, default: () => new Date() },
}, { versionKey: false });

IdempotencyRecordSchema.index({ userId: 1, key: 1 }, { unique: true });
IdempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: IDEMPOTENCY_TTL_SECONDS });

export default mongoose.model<IIdempotencyRecord>("IdempotencyRecord", IdempotencyRecordSchema);
