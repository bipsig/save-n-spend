// Deliberately NOT importing mongoose's `Date`: it shadows the global one, and
// `occurredAt` then types as a schema type rather than the JS Date it actually holds —
// which hides every `getTime`/`toISOString` the date helpers do with it.
import mongoose, { Document } from "mongoose";
import { Schema } from "mongoose";

export interface ITransaction extends Document {
    userId: mongoose.Types.ObjectId;
    type: string;
    amount: number;
    account: mongoose.Types.ObjectId;
    toAccount?: mongoose.Types.ObjectId | null;
    category?: mongoose.Types.ObjectId | null;
    title?: string | null;
    note?: string | null;
    paymentMode?: string | null;
    location?: string | null;
    receiptUrl?: string | null;
    occurredAt: Date;
    splitGroupId?: mongoose.Types.ObjectId | null;
    /** On every transaction a trip created or settled. Insights groups these as one Trips
     *  slice and budgets leave them out; every total still counts them. */
    tripId?: mongoose.Types.ObjectId | null;
    /** On the transactions a trip expense generated — they're edited through the trip. */
    tripExpenseId?: mongoose.Types.ObjectId | null;
    /** A key that makes a row once only, unique per user (partial index below). Add Transaction
     *  sends one on every create, and a replay of it answers with the saved row. Trips use it
     *  too: `sw:<trip>:<key>` on imported settle-ups, `plan:<trip>:<person>` on plan reroutes.
     *  Absent on rows made any other way. */
    clientId?: string | null;
};

const TransactionSchema = new Schema<ITransaction>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ["expense", "income", "transfer", "positiveAdjustment", "negativeAdjustment"], required: true },
    amount: { type: Number, required: true, min: 0 },
    account: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    toAccount: { type: Schema.Types.ObjectId, ref: "Account" },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    title: { type: String, trim: true },
    note: { type: String },
    location: { type: String },
    receiptUrl: { type: String },
    paymentMode: { type: String, enum: ["cash", "card", "upi", "transfer"] },
    occurredAt: { type: Schema.Types.Date, required: true },
    // Shared by every member of a split expense — the expense (the user's share) and one
    // transfer per person owed. Deleting the expense deletes the group by this key.
    splitGroupId: { type: Schema.Types.ObjectId, default: null },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", default: null },
    tripExpenseId: { type: Schema.Types.ObjectId, ref: "TripExpense", default: null },
    clientId: { type: String }
}, { timestamps: true });

TransactionSchema.index({ userId: 1, occurredAt: -1 });
TransactionSchema.index({ userId: 1, splitGroupId: 1 }, { sparse: true });
TransactionSchema.index({ userId: 1, tripId: 1 }, { sparse: true });
TransactionSchema.index({ tripExpenseId: 1 }, { sparse: true });
// Partial (not sparse): only rows with a key are indexed, so the many ordinary transactions
// with clientId:undefined can't collide on unique. A replay of a saved key throws E11000
// inside the create's transaction; createTransaction answers it with the saved row (200).
TransactionSchema.index(
    { userId: 1, clientId: 1 },
    { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

export default mongoose.model<ITransaction>(
    "Transaction",
    TransactionSchema
);