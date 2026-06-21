import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  currency: string;
  pushToken?: string;
  prefs: {
    darkMode: boolean;
    notifications: boolean;
    defaultAccount?: mongoose.Types.ObjectId | null;
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
      darkMode: { type: Boolean, default: false },
      notifications: { type: Boolean, default: true },
      defaultAccount: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    },

    password: { type: String },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },

    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },

    googleId: { type: String, default: null },

    totpSecret: { type: String, default: null },
    totpEnabled: { type: Boolean, default: false },
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

UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
UserSchema.index({ resetTokenExpiry: 1 });

export default mongoose.model<IUser>('User', UserSchema);
