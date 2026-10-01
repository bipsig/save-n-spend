import mongoose, { Document, Schema } from "mongoose";

// A trip: a stretch of dates, the people on it, and optionally a budget. Everything spent on
// it is ordinary transactions tagged with its id (see TripExpense) — so balances, cash flow and
// totals stay true — while Insights groups them as one "Trips" slice and budgets leave them out.
export interface ITrip extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    emoji: string;
    color: string;
    startDate: Date;
    endDate: Date;
    /** Person accounts of the people on the trip, not including you. */
    members: mongoose.Types.ObjectId[];
    /** Paise; null for none. */
    budget: number | null;
    status: "active" | "closed";
    closedAt: Date | null;
}

const TripSchema = new Schema<ITrip>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: "🧳" },
    color: { type: String, default: "teal" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "Account" }],
    budget: { type: Number, default: null, min: 0 },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    closedAt: { type: Date, default: null },
}, { timestamps: true });

TripSchema.index({ userId: 1, startDate: -1 });

export default mongoose.model<ITrip>("Trip", TripSchema);
