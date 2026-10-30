
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateToken = (ownerId) => {
  return jwt.sign(
    { sub: ownerId.toString() },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: "sweatboat-api",
      audience: "sweatboat-web"
    }
  );
};
