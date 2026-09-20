import mongoose, { Document, PaginateModel } from "mongoose";
import { Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2"

// The permanent record `GET /highlights` itself never keeps — that endpoint recomputes
// fresh from live data every call, so a highlight that resolves (or gets crowded off the
// materiality-ranked, max-4 list) leaves no trace anywhere. This model is that trace:
// one row per distinct highlight KEY, written once, at whatever wording it had the first
// time it was seen, and never updated or deleted afterward — see highlightController.ts's
// logHighlights, which upserts with $setOnInsert so a rule firing again under the same
// key (the normal case — it recomputes every poll) never touches the existing row.
export interface IHighlightLog extends Document {
    userId: mongoose.Types.ObjectId;
    ruleId: string;
    key: string;
    severity: string;
    title: string;
    body: string;
    materiality: number;
    screen?: string | null;
    createdAt: Date;
}

const HighlightLogSchema = new Schema<IHighlightLog>({
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    ruleId: { type: String, required: true },
    key: { type: String, required: true },
    severity: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    materiality: { type: Number, required: true },
    screen: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

// One row per key, forever — the constraint that makes this an append-only log rather
// than a place the live poll could quietly duplicate into.
HighlightLogSchema.index({ userId: 1, key: 1 }, { unique: true });
HighlightLogSchema.index({ userId: 1, createdAt: -1 });
HighlightLogSchema.plugin(mongoosePaginate);

export default mongoose.model<IHighlightLog, PaginateModel<IHighlightLog>>(
    "HighlightLog",
    HighlightLogSchema
);
