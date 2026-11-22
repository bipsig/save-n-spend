import mongoose, { Document, Schema } from "mongoose";

export interface IGoal extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    target: number;
    saved: number;
    icon?: string;
    color?: string;
    deadline?: Date;
    /** A deleted goal is archived, not erased, so its contribution logs keep a name (Review). */
    isArchived: boolean;
    /** Written by `timestamps: true`. Declared because the health score measures how
     *  much has been saved PER MONTH since the goal was created, and that rate is the
     *  only way to tell a goal that is behind from one that is simply new. */
    createdAt: Date;
}

const GoalSchema = new Schema<IGoal>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    target: { type: Number, required: true, min: 0 },
    saved: { type: Number, default: 0, min: 0 },
    icon: { type: String },
    color: { type: String },
    deadline: { type: Date },
    isArchived: { type: Boolean, default: false },
}, { timestamps: true })

GoalSchema.index({ userId: 1 });

/** Goals the user still has. `$ne: true` because goals saved before 2.8.7 have no flag. */
export const LIVE_GOAL = { isArchived: { $ne: true } } as const;

export default mongoose.model<IGoal>("Goal", GoalSchema);
