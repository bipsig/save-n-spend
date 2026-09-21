import mongoose, { Document, Schema } from 'mongoose';
import { DEFAULT_ZONE, isValidZone } from '../utils/timezone';

// Named so the notification services can take just this slice of a user rather than a
// whole hydrated document — a cron tick reads it for thousands of users at once.
export interface INotificationPrefs {
  enabled: boolean;
  billReminderLead: number;
  budgetAlerts: boolean;
  goalMilestones: boolean;
  dailySummary: boolean;
  weeklySummary: boolean;
  monthlySummary: boolean;
  investmentReminder: boolean;
  investmentReminderDay: number;
}

export interface IUser extends Document {
  name: string;
  email: string;
  currency: string;
  pushToken?: string;
  prefs: {
    defaultAccount?: mongoose.Types.ObjectId | null;
    timeZone: string;
    notifications: INotificationPrefs;
  };
  // local auth
  password?: string;
  authProvider: 'local' | 'google';
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;

  // google auth
  googleId?: string | null;

  // totp 2fa (post-MVP)
  totpSecret?: string | null;
  totpEnabled: boolean;

  /**
   * Set when the user deletes their account. Nothing is erased: the row and everything
   * it owns stay exactly as they were, and signing in again clears this field and hands
   * the account back intact.
   *
   * Absent (not `false`) while the account is live, so "is this account deactivated" is
   * a plain existence test and the reminder job's filter can stay a single `$eq: null`.
   */
  deactivatedAt?: Date | null;

  // timestamps
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    currency: { type: String, default: 'INR' },
    pushToken: { type: String },

    prefs: {
      defaultAccount: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
      // The IANA zone every date bucket in the app is cut in (see utils/timezone).
      // Validated against the runtime's own zone database rather than an enum, so
      // the list can't drift out of date; the default covers documents written
      // before this field existed, which were all bucketed as IST regardless.
      timeZone: {
        type: String,
        default: DEFAULT_ZONE,
        validate: {
          validator: isValidZone,
          message: '{VALUE} is not a recognised time zone',
        },
      },
      notifications: {
        enabled: { type: Boolean, default: true },
        billReminderLead: { type: Number, enum: [1, 3, 7], default: 3 },
        budgetAlerts: { type: Boolean, default: true },
        goalMilestones: { type: Boolean, default: true },
        // Daily and weekly default off, monthly on. A push every morning is the kind
        // of thing people uninstall an app over, so it has to be asked for; twelve a
        // year, on a day the user is already thinking about last month, is not.
        dailySummary: { type: Boolean, default: false },
        weeklySummary: { type: Boolean, default: false },
        monthlySummary: { type: Boolean, default: true },
        // Opt-in, on a user-chosen day of month (capped 1–28 so it lands every month).
        investmentReminder: { type: Boolean, default: false },
        investmentReminderDay: { type: Number, min: 1, max: 28, default: 1 }
      }
    },

    password: { type: String },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },

    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },

    googleId: { type: String, default: null },

    totpSecret: { type: String, default: null },
    totpEnabled: { type: Boolean, default: false },

    deactivatedAt: { type: Schema.Types.Date, default: null },
  },
  { timestamps: true }
);

// Never leak sensitive fields in any API response
UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.resetToken;
    delete ret.resetTokenExpiry;
    delete ret.totpSecret;
    return ret;
  },
});

// Partial (not sparse): only index real Google accounts, so the many local
// users with googleId:null are never indexed and can't collide on unique.
UserSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }
);
UserSchema.index({ resetTokenExpiry: 1 });

export default mongoose.model<IUser>('User', UserSchema);
