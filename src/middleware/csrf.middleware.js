import { env } from "../config/env.js";

const allowedOrigins = env.CLIENT_URL
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

const csrfProtection = (req, res, next) => {
  // Safe requests do not change server state.
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  const origin = req.get("Origin");

  // Allow non-browser clients such as Postman and server-to-server calls.
  if (!origin) {
    return next();
  }

  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed"
    });
  }

  next();
};

export default csrfProtection;