import mongoose, { Document, Schema } from "mongoose";

export interface IAccount extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    type: string;
    balance: number;
    startingBalance: number;
    icon?: string
    color?: string
    investmentKind?: string
    isArchived: boolean
    /**
     * When the user last reconciled this account against their bank. Stamped even when
     * the balance already matched, because "I checked and it was right" is information
     * the user wants back — it is the difference between a stale figure and a confirmed
     * one. Absent on accounts that have never been synced.
     */
    lastSyncedAt?: Date | null
    /**
     * Where this sits in the user's own list. 0 for everything until they reorder, which
     * is why the list endpoint breaks ties on `createdAt`.
     */
    order: number
}

const AccountSchema = new Schema<IAccount>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["bank", "credit_card", "cash", "wallet", "person", "investment" ], required: true },
    balance: { type: Number, required: true, default: 0 },
    startingBalance: { type: Number, required: true, default: 0 },
    icon: { type: String },
    color: { type: String },
    // Only meaningful for type "investment" — the hub's grouping key (SIP / Mutual Fund / …).
    investmentKind: { type: String },
    isArchived: { type: Boolean, default: false },
    lastSyncedAt: { type: Schema.Types.Date, default: null },
    order: { type: Number, default: 0 }
}, { timestamps: true })

AccountSchema.index({ userId: 1, isArchived: 1 });

export default mongoose.model<IAccount>('Account', AccountSchema);