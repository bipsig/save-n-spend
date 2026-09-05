import { Request, Response } from 'express';
import bcrypt from "bcryptjs";
import User from '../models/User';
import { AppError } from '../utils/AppError';
import * as reply from '../utils/response';
import { changePasswordSchema, loginSchema, registerSchema } from '../schemas/authSchema';
import { generateAccessToken } from '../utils/generateAccessToken';
import mongoose from 'mongoose';
import Account from '../models/Account';
import { defaultCategories } from '../data/defaultCategories';
import Category from '../models/Category';

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, timeZone } = registerSchema.parse(req.body);

  const existingUser = await User.findOne({
    email
  });

  if (existingUser) {
    throw AppError.conflict("Email is already in use");
  }

  const saltRounds: number = Number(process.env.SALT_ROUNDS) || 12;
  const hashedPassword: string = await bcrypt.hash(password, saltRounds);

  let createdUser;
  const session = await mongoose.startSession();
  try {
    (await session.withTransaction(async () => {
      // Transaction 1: Initial Registration of User
      const [newUser] = await User.create([{
        name,
        email,
        password: hashedPassword,
        authProvider: "local",
        // Left to the schema default when the client didn't say, rather than
        // written as undefined — Mongoose treats an explicit undefined as "no
        // default" for nested paths.
        ...(timeZone ? { prefs: { timeZone } } : {})
      }], { session });

      createdUser = newUser; 

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
      // Parent first, then its children — a child needs its parent's `_id`, which only
      // exists once the parent is written. Sequential rather than a bulk insert for the
      // same reason; the set is small and this runs once per user, ever.
      //
      // Children inherit their parent's `kind`, never carry their own: an income child
      // under an expense parent would fold earnings into a spending total everywhere
      // the rollup runs.
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
      createdUser = await newUser.save({ session });
    }))
  }
  finally {
    session.endSession();
  }

  reply.created(res, createdUser, 'User registered successfully!');
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await User.findOne({
    email
  });

  if (!user) {
    throw AppError.unauthorized("Invalid credentials!");
  }

  if (!user.password) {
    throw AppError.unauthorized("Invalid credentials!");
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw AppError.unauthorized("Invalid credentials!");
  }

  const accessToken: string = generateAccessToken (user);
  const responseData = {
    accessToken,
    userData: {
      name: user.name,
      email: user.email
    }
  };

  reply.ok(res, responseData, "User logged in successfully!");
}

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  reply.ok(res, user, "User fetched successfully");
}

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await User.findById(req.user?.userId);

  if (!user) {
    throw AppError.notFound("User not found");
  }

  if (!user.password) {
    throw AppError.badRequest("This account signs in with Google, so there is no password to change");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    throw AppError.unauthorized("Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw AppError.badRequest("Choose a password different from your current one");
  }

  const saltRounds: number = Number(process.env.SALT_ROUNDS) || 12;
  user.password = await bcrypt.hash(newPassword, saltRounds);

  // Existing tokens stay valid: they are stateless JWTs with no server-side
  // record to revoke. Sessions on other devices therefore survive the change.
  await user.save();

  reply.ok(res, null, "Password changed successfully");
}