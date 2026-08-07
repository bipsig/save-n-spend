import mongoose, { Document, Schema } from "mongoose";

export interface IBudget extends Document {
    userId: mongoose.Types.ObjectId;
    category: mongoose.Types.ObjectId;
    month: string;
    limit: number;
}

const BudgetSchema = new Schema<IBudget>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    month: { type: String, required: true },
    limit: { type: Number, required: true, min: 0 }
}, { timestamps: true })

BudgetSchema.index({ userId: 1, category: 1, month: 1 }, { unique: true });

export default mongoose.model<IBudget>("Budget", BudgetSchema);
