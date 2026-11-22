import mongoose, { Document, Schema } from "mongoose";
import { TRIP_STATUSES } from "../constants";

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
    /** The day (`YYYY-MM-DD`, the user's zone) the closed trip counts as one expense in Trips.
     *  Absent on trips closed before 2.8.6: read it with `closedOnOf`. */
    closedOn?: string | null;
    /** What each person actually pays you, when it differs from the exact split — see
     *  tripLedger's planReroute. Absent on a trip nobody has matched. */
    plan?: {
        savedAt: Date;
        /** Per person, signed paise: positive = they pay you, negative = you pay them. */
        entries: { account: mongoose.Types.ObjectId; amount: number }[];
        /** Fingerprint of the trip's expenses when it was saved; a change means it's stale. */
        signature: string;
    } | null;
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
    status: { type: String, enum: [...TRIP_STATUSES], default: "active" },
    closedAt: { type: Date, default: null },
    closedOn: { type: String, default: undefined },
    plan: {
        type: new Schema({
            savedAt: { type: Date, required: true },
            entries: [{
                _id: false,
                account: { type: Schema.Types.ObjectId, ref: "Account", required: true },
                amount: { type: Number, required: true },
            }],
            signature: { type: String, required: true },
        }, { _id: false }),
        default: undefined,
    },
}, { timestamps: true });

TripSchema.index({ userId: 1, startDate: -1 });

export default mongoose.model<ITrip>("Trip", TripSchema);
