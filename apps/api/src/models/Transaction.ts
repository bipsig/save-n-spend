import mongoose, { Date, Document, PaginateModel } from "mongoose";
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
    occurredAt: Date
};

const TransactionSchema = new Schema<ITransaction>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ["expense", "income", "transfer"], required: true },
    amount: { type: Number, required: true, min: 0 },
    account: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    toAccount: { type: Schema.Types.ObjectId, ref: "Account" },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    title: { type: String, trim: true },
    note: { type: String },
    location: { type: String },
    receiptUrl: { type: String },
    paymentMode: { type: String, enum: ["cash", "card", "upi", "transfer"] },
    occurredAt: { type: Schema.Types.Date, required: true }
}, { timestamps: true });

TransactionSchema.index({ userId: 1, occurredAt: -1 });
TransactionSchema.plugin(mongoosePaginate);

export default mongoose.model<ITransaction, PaginateModel<ITransaction>>(
    "Transaction",
    TransactionSchema
);