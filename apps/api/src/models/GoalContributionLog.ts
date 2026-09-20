import mongoose, { Document, Schema } from "mongoose";

// One row per contribution, ever — Goal.saved has no history of its own (it's a plain
// running total, mutated in place), so this is the only record of WHEN money went into a
// goal. Exists purely for Month/Week in Review's "₹X saved on this goal" figure; nothing
// else reads it. Never updated or deleted, same append-only shape as HighlightLog, but no
// unique-key dedupe — every contribution is a real event, not a recomputed fact that could
// otherwise be logged twice.
export interface IGoalContributionLog extends Document {
    userId: mongoose.Types.ObjectId;
    goalId: mongoose.Types.ObjectId;
    amount: number;
    createdAt: Date;
}

const GoalContributionLogSchema = new Schema<IGoalContributionLog>({
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    goalId: { type: Schema.Types.ObjectId, required: true, ref: "Goal" },
    amount: { type: Number, required: true, min: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } });

GoalContributionLogSchema.index({ userId: 1, goalId: 1, createdAt: -1 });

export default mongoose.model<IGoalContributionLog>("GoalContributionLog", GoalContributionLogSchema);
