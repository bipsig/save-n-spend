import { Request, Response } from 'express';

export const register = (_req: Request, res: Response) => {
  console.log('register');
  res.status(201).json({ message: 'registered' });
}