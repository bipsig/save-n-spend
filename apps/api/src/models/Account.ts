import mongoose, { Document, Schema } from "mongoose";

export interface IAccount extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    type: string;
    balance: number;
    startingBalance: number;
    icon?: string
    color?: string
    isArchived: boolean
}

const AccountSchema = new Schema<IAccount>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["bank", "credit_card", "cash", "wallet" ], required: true },
    balance: { type: Number, required: true, default: 0 },
    startingBalance: { type: Number, required: true, default: 0 },
    icon: { type: String },
    color: { type: String },
    isArchived: { type: Boolean, default: false }
}, { timestamps: true })

AccountSchema.index({ userId: 1, isArchived: 1 });

export default mongoose.model<IAccount>('Account', AccountSchema);