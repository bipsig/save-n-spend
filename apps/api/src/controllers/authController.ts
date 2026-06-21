import { Request, Response } from 'express';
import bcrypt from "bcryptjs";
import User from '../models/User';
import { AppError } from '../utils/AppError';
import * as reply from '../utils/response';
import { loginSchema, registerSchema } from '../schemas/authSchema';
import { generateAccessToken } from '../utils/generateAccessToken';

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = registerSchema.parse(req.body);
  // console.log (userData);

  const existingUser = await User.findOne({
    email
  });

  if (existingUser) {
    throw AppError.conflict("Email is already in use");
  }

  const saltRounds: number = Number(process.env.SALT_ROUNDS) || 12;
  const hashedPassword: string = await bcrypt.hash(password, saltRounds);

  const savedUser = await User.create ({ 
    name,
    email,
    password: hashedPassword,
    authProvider: "local"
  });

  reply.created(res, savedUser, 'User registered successfully!');
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