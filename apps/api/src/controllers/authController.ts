import { Request, Response } from 'express';
import bcrypt from "bcryptjs";
import User from '../models/User';
import { AppError } from '../utils/AppError';
import * as reply from '../utils/response';
import type { Valid } from '../middleware/validate';
import { AUTH_MESSAGES } from '../middleware/authMiddleware';
import { changePasswordSchemas, loginSchemas, registerSchemas } from '../schemas/authSchema';
import { generateAccessToken } from '../utils/generateAccessToken';
import { inTransaction } from '../utils/inTransaction';
import { toDTO } from '../utils/dto';
import Account from '../models/Account';
import { defaultCategories } from '../data/defaultCategories';
import Category from '../models/Category';

const EMAIL_TAKEN = "An account with this email already exists. Sign in instead";
const WRONG_CREDENTIALS = "That email and password don't match";

const emailTaken = () => new AppError(409, EMAIL_TAKEN, { code: "duplicate" });
const wrongCredentials = () => new AppError(401, WRONG_CREDENTIALS, { code: "invalid_credentials" });
// The token was fine a moment ago (protect let it through) but its user is gone.
const signInAgain = () => new AppError(401, AUTH_MESSAGES.signIn, { code: "unauthenticated" });

const isDuplicateKey = (err: unknown) => (err as { code?: number } | null)?.code === 11000;

export const register = async (req: Request, res: Response): Promise<void> => {
  const { body: { name, email, password, timeZone } } = req.valid as Valid<typeof registerSchemas>;

  const existingUser = await User.findOne({
    email
  });

  if (existingUser) {
    throw emailTaken();
  }

  const saltRounds: number = Number(process.env.SALT_ROUNDS) || 12;
  const hashedPassword: string = await bcrypt.hash(password, saltRounds);

  let createdUser;
  try {
    createdUser = await inTransaction(async (session) => {
      // Transaction 1: Initial Registration of User
      const [newUser] = await User.create([{
        name,
        email,
        password: hashedPassword,
        authProvider: "local",
        // Left to the schema default rather than written as undefined — Mongoose
        // treats an explicit undefined as "no default" for nested paths.
        ...(timeZone ? { prefs: { timeZone } } : {})
      }], { session });

      // Transaction 2: Default Account Creation
      const [newAccount] = await Account.create([{
        userId: newUser._id,
        name: "Cash",
        type: "cash",
        balance: 0,
        startingBalance: 0
      }], { session });

      // Transaction 3: Categories Seeding
      //
      // Parent first: a child needs its parent's `_id`, which is why this is sequential
      // rather than a bulk insert. Children inherit their parent's `kind` — an income
      // child under an expense parent would fold earnings into a spending total.
      for (const category of defaultCategories) {
        const [parent] = await Category.create([{
          userId: newUser._id,
          name: category.name,
          parent: null,
          kind: category.kind,
          icon: category.icon,
          color: category.color
        }], { session });

        for (const child of category.children ?? []) {
          await Category.create([{
            userId: newUser._id,
            name: child.name,
            parent: parent._id,
            kind: category.kind,
            icon: child.icon,
            color: child.color
          }], { session });
        }
      }

      // Transaction 4: Setting Default Account
      newUser.prefs.defaultAccount = newAccount._id;
      return newUser.save({ session });
    });
  }
  catch (err) {
    // Two sign-ups with the same email at once: the unique index stops the second.
    if (isDuplicateKey(err)) throw emailTaken();
    throw err;
  }

  // The user as before, plus the same token sign-in gives (gaps row 132), so a client can skip
  // the second request. The apps up to 2.8.8 ignore this body and sign in from Welcome.
  reply.created(res, { ...toDTO(createdUser), accessToken: generateAccessToken(createdUser) }, 'User registered');
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const { body: { email, password } } = req.valid as Valid<typeof loginSchemas>;

  const user = await User.findOne({
    email
  });

  if (!user || !user.password) {
    throw wrongCredentials();
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw wrongCredentials();
  }

  // Signing in IS the undo for a deleted account (see userController.deleteMe): correct
  // credentials are proof enough that the person coming back is the person who left.
  // Cleared before the token is issued, so the account is live by the app's first
  // authenticated call.
  if (user.deactivatedAt) {
    user.deactivatedAt = null;
    await user.save();
  }

  const accessToken: string = generateAccessToken (user);
  const responseData = {
    accessToken,
    userData: {
      name: user.name,
      email: user.email
    }
  };

  reply.ok(res, responseData, "User signed in");
}

// A closed account never gets here: `protect` turns it away on every route, this one
// included, which is what lands it back at login, where reactivation starts.
export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw signInAgain();
  }

  reply.ok(res, toDTO(user), "User fetched");
}

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { body: { currentPassword, newPassword } } = req.valid as Valid<typeof changePasswordSchemas>;

  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw signInAgain();
  }

  if (!user.password) {
    throw AppError.badRequest("This account signs in with Google, so there is no password to change");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);

  // 400, not 401: the session is fine, only the password typed into the form is wrong.
  if (!isMatch) {
    throw new AppError(400, "Your current password isn't right", { code: "wrong_password" });
  }

  if (currentPassword === newPassword) {
    throw AppError.badRequest("Choose a password different from your current one");
  }

  const saltRounds: number = Number(process.env.SALT_ROUNDS) || 12;
  user.password = await bcrypt.hash(newPassword, saltRounds);

  // Every other login ends (gaps row 42). This phone keeps its session: it gets a fresh token
  // (2.8.6 stores it), and the token it sent stays valid too, since 2.8.5 ignores the reply.
  user.tokensValidAfter = new Date();
  user.tokenKept = req.user?.loginTime ?? null;
  await user.save();

  reply.ok(res, { accessToken: generateAccessToken(user) }, "Password changed");
}
