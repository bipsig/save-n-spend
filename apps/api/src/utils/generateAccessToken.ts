import jwt from "jsonwebtoken"
import { IUser } from "../models/User";

export const generateAccessToken = (user:IUser): string => {
  const payload = {
    userId: user._id,
    name: user.name,
    email: user.email,
    loginTime: new Date().toISOString()
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }


  const accessToken = jwt.sign(
    payload,
    secret,
    {
      expiresIn: 60*60*24*7
    }
  );

  return accessToken;
}