// Deliberately NOT importing mongoose's `Date`: it shadows the global one, and
// `occurredAt` then types as a schema type rather than the JS Date it actually holds —
// which hides every `getTime`/`toISOString` the date helpers do with it.
import mongoose, { Document, PaginateModel } from "mongoose";
import { Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2"

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
    /** Set only by an offline-queued create; absent on every ordinary transaction. */
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
    clientId: { type: String }
}, { timestamps: true });

TransactionSchema.index({ userId: 1, occurredAt: -1 });
TransactionSchema.index({ userId: 1, splitGroupId: 1 }, { sparse: true });
// Partial (not sparse): only index queued-offline creates, so the many ordinary
// transactions with clientId:undefined are never indexed and can't collide on unique.
// A duplicate replay throws E11000 inside the create's own session.withTransaction,
// which errorHandler.ts already turns into a 409 the client reads as "already applied".
TransactionSchema.index(
    { userId: 1, clientId: 1 },
    { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);
TransactionSchema.plugin(mongoosePaginate);

export default mongoose.model<ITransaction, PaginateModel<ITransaction>>(
    "Transaction",
    TransactionSchema
);