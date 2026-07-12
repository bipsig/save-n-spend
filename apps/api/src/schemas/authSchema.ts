import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.string().email("Invalid Email"),
  password: z.string().min(8, 'Password must be atleast 8 characters')
});

export const loginSchema = z.object({
  email: z.string().email("Invalid Email"),
  password: z.string().min(8, 'Password must be atleast 8 characters')
})

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;