import mongoose, { Document, Schema } from "mongoose";

// "Not recurring" on a suggestion, remembered per account (so it holds on every device). One
// row per dismissed pattern key — see recurringMath's `key`: kind + normalised title.
export interface IRecurringDismissal extends Document {
    userId: mongoose.Types.ObjectId;
    key: string;
}

const RecurringDismissalSchema = new Schema<IRecurringDismissal>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
}, { timestamps: true });

RecurringDismissalSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model<IRecurringDismissal>("RecurringDismissal", RecurringDismissalSchema);
