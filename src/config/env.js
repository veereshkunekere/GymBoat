
import dotenv from "dotenv";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

const allowedEnvironments = ["development", "test", "production"];

if (!allowedEnvironments.includes(NODE_ENV)) {
  throw new Error(
    `Invalid NODE_ENV: ${NODE_ENV}. Allowed: ${allowedEnvironments.join(", ")}`
  );
}

// Required environment variables
const requiredEnv = ["MONGODB_URI", "JWT_SECRET"];

for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

// Validate JWT secret strength
if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// Validate MongoDB connection string
if (
  !/^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI)
) {
  throw new Error("Invalid MONGODB_URI");
}

// Validate port
const PORT = Number(process.env.PORT || 5000);

if (
  !Number.isInteger(PORT) ||
  PORT < 1 ||
  PORT > 65535
) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

// Validate frontend URL
const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173";

try {
  const parsedUrls = CLIENT_URL.split(",").map((url) => new URL(url.trim()));

  if (!parsedUrls.every((url) => ["http:", "https:"].includes(url.protocol))) {
    throw new Error();
  }
} catch {
  throw new Error("CLIENT_URL must be a valid HTTP or HTTPS URL");
}

// Validate cookie configuration
const COOKIE_SAME_SITE =
  process.env.COOKIE_SAME_SITE || "lax";

if (!["strict", "lax", "none"].includes(COOKIE_SAME_SITE)) {
  throw new Error(
    "COOKIE_SAME_SITE must be strict, lax, or none"
  );
}

const COOKIE_SECURE = NODE_ENV === "production";

if (COOKIE_SAME_SITE === "none" && !COOKIE_SECURE) {
  throw new Error(
    "SameSite=None requires secure cookies and HTTPS"
  );
}

export const env = Object.freeze({
  PORT,
  NODE_ENV,

  MONGODB_URI: process.env.MONGODB_URI,
  CLIENT_URL,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",

  JWT_COOKIE_NAME:
    process.env.JWT_COOKIE_NAME || "gym_token",

  COOKIE_SECURE,
  COOKIE_SAME_SITE
});
