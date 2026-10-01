import mongoose, { Document, Schema } from "mongoose";

// One shared expense the way the group sees it: the whole bill, who paid it, and everyone's
// share. It isn't counted anywhere itself — it generates ordinary transactions (see
// services/tripLedger): your share as an expense, and when you paid, a transfer to each friend
// for theirs. Editing or deleting it rewrites those together, so a trip never has a split whose
// parts disagree.
export interface ITripShare {
    /** null = you; otherwise a member's person account. */
    account: mongoose.Types.ObjectId | null;
    amount: number;
}

export interface ITripExpense extends Document {
    userId: mongoose.Types.ObjectId;
    tripId: mongoose.Types.ObjectId;
    title: string;
    occurredAt: Date;
    category: mongoose.Types.ObjectId | null;
    /** Paise — the whole bill. */
    cost: number;
    /** null = you paid; otherwise the member's person account that did. */
    paidBy: mongoose.Types.ObjectId | null;
    /** Your account it came out of, when you paid. */
    paidFrom: mongoose.Types.ObjectId | null;
    shares: ITripShare[];
    source: "manual" | "splitwise";
    /** Splitwise row fingerprint, so a re-import skips what's already in. */
    importKey: string | null;
}

const ShareSchema = new Schema<ITripShare>({
    account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const TripExpenseSchema = new Schema<ITripExpense>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true },
    title: { type: String, required: true, trim: true },
    occurredAt: { type: Date, required: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    cost: { type: Number, required: true, min: 1 },
    paidBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    paidFrom: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    shares: { type: [ShareSchema], required: true },
    source: { type: String, enum: ["manual", "splitwise"], default: "manual" },
    importKey: { type: String, default: null },
}, { timestamps: true });

TripExpenseSchema.index({ userId: 1, tripId: 1, occurredAt: -1 });
TripExpenseSchema.index({ tripId: 1, importKey: 1 }, { sparse: true });

export default mongoose.model<ITripExpense>("TripExpense", TripExpenseSchema);
