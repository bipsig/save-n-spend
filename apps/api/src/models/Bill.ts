import mongoose, { Document, Schema } from "mongoose";

export interface IBill extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    amount: number;
    category: mongoose.Types.ObjectId | null;
    account?: mongoose.Types.ObjectId;
    dueDate: Date;
    lastPaidAt: Date | null;
    status: "pending" | "paid";
    recurring: boolean;
    frequency?: "monthly" | "yearly";
    reminderDays?: number;
}

const BillSchema = new Schema<IBill>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    account: { type: Schema.Types.ObjectId, ref: "Account" },
    dueDate: { type: Date, required: true },
    lastPaidAt: { type: Date, default: null },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    recurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ["monthly", "yearly"] },
    reminderDays: { type: Number, min: 0 }
}, { timestamps: true })

BillSchema.index({ userId: 1, dueDate: 1 });

export default mongoose.model<IBill>("Bill", BillSchema);
