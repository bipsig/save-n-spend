import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
    | "billReminder"
    | "billOverdue"
    | "budgetWarning"
    | "budgetExceeded"
    | "goalMilestone"
    | "goalDeadline"
    | "dailySummary"
    | "weeklySummary"
    | "monthlySummary";

export interface INotificationDoc extends Document {
    userId: mongoose.Types.ObjectId;
    type: NotificationType;
    title: string;
    body: string;
    link?: { screen: string; id?: string };
    /**
     * What makes a notification fire exactly once. Composed by the caller out of the
     * thing it is about and the occasion — "bill:<id>:due:2026-09-12",
     * "budget:<id>:2026-09:over" — so the same occasion produces the same key however
     * many times it is evaluated.
     *
     * The uniqueness is a DB index rather than a read-then-write check because the
     * reminder job may overlap itself (a slow tick, a restart, two instances), and a
     * check-then-write loses that race. Here the second writer gets a duplicate-key
     * error, which the service reads as "already sent".
     */
    dedupeKey: string;
    /** When the push was handed to Expo. Null = in-app only (no token, or push failed). */
    pushedAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
}

const NotificationSchema = new Schema<INotificationDoc>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: {
        type: new Schema({ screen: { type: String, required: true }, id: { type: String } }, { _id: false }),
        required: false,
    },
    dedupeKey: { type: String, required: true },
    pushedAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
}, { timestamps: true });

// The once-only guarantee. Scoped to the user so two users' bills can share a key shape.
NotificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

// The feed's only query: this user's newest first.
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Notifications are a log, not a record — nobody scrolls to last winter's bill
// reminder, and the collection would otherwise grow forever. 90 days also re-arms the
// dedupe key, which is what we want: a yearly bill's reminder should be allowed to
// fire again next year.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model<INotificationDoc>("Notification", NotificationSchema);
