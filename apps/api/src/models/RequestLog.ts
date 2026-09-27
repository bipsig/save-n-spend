import mongoose, { Document, Schema } from "mongoose";

// The last week of what happened: one row per API request, per error reported from the phone,
// and per notification the server tried to raise. Kept so a failure can be looked up by the
// reference the user saw ("Ref 7K2QXB"), or by account and time, from the Atlas data explorer.
//
// Never the request body or response — only where, who, what came back, and how long. Money
// never lands here; see `scrub` in utils/logger.
export type LogSource = "api" | "app" | "job";

export interface IRequestLog extends Document {
    requestId: string | null;
    userId: mongoose.Types.ObjectId | null;
    source: LogSource;
    /** api: `GET /api/v1/bills/:id` (the route pattern, not the ids). app: the screen.
     *  job: what ran, e.g. `notify:dailySummary`. */
    route: string;
    status: number | null;
    durationMs: number | null;
    /** api: error message on a failed request. app: the error's message. job: the outcome. */
    message: string | null;
    /** A few lines of stack for a 500 or an app error — the frame that threw, not the whole trace. */
    stack: string | null;
    appVersion: string | null;
    createdAt: Date;
}

/** How long a row lives. Past a week it's no longer the answer to "what just happened". */
export const LOG_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const RequestLogSchema = new Schema<IRequestLog>({
    requestId: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    source: { type: String, enum: ["api", "app", "job"], required: true },
    route: { type: String, required: true },
    status: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    message: { type: String, default: null },
    stack: { type: String, default: null },
    appVersion: { type: String, default: null },
    createdAt: { type: Date, default: () => new Date() },
}, { versionKey: false });

// Mongo drops rows on its own once they pass the retention — no cleanup job to forget.
RequestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOG_RETENTION_SECONDS });
RequestLogSchema.index({ requestId: 1 });
RequestLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IRequestLog>("RequestLog", RequestLogSchema);
