import mongoose, { Document, Schema } from "mongoose";

export interface IGoal extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    target: number;
    saved: number;
    icon?: string;
    color?: string;
    deadline?: Date;
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
    deadline: { type: Date }
}, { timestamps: true })

GoalSchema.index({ userId: 1 });

export default mongoose.model<IGoal>("Goal", GoalSchema);
