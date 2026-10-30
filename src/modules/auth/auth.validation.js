
import { z } from "zod";

const passwordSchema = z.string()
  .min(8, "Password must contain at least 8 characters")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 bytes"
  );

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),

  email: z.string().trim().email().max(254),

  password: passwordSchema,

  gymName: z.string().trim().min(2).max(150),

  phone: z.string().trim().optional()
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),

  password: z.string().min(1)
});
