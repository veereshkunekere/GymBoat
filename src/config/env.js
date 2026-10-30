
import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "MONGODB_URI",
  "JWT_SECRET"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

export const env = {
  PORT: Number(process.env.PORT) || 5000,

  NODE_ENV: process.env.NODE_ENV || "development",

  MONGODB_URI: process.env.MONGODB_URI,

  CLIENT_URL:
    process.env.CLIENT_URL || "http://localhost:5173",

  JWT_SECRET: process.env.JWT_SECRET,

  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",

  JWT_COOKIE_NAME:
    process.env.JWT_COOKIE_NAME || "gym_token",

  COOKIE_SECURE: process.env.NODE_ENV === "production",

  COOKIE_SAME_SITE:
    process.env.COOKIE_SAME_SITE ||
    (process.env.NODE_ENV === "production" ? "none" : "lax")
};
