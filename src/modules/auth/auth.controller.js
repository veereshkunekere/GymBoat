
import {
  registerOwner,
  loginOwner,
  getCurrentOwner
} from "./auth.service.js";

import { env } from "../../config/env.js";
import jwt from "jsonwebtoken";
const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: "/"
};

const setAuthCookie = (res, token) => {
  const decodedToken = jwt.decode(token);

  if (!decodedToken?.exp) {
    throw new Error("Authentication token is missing expiration");
  }

  const maxAge = Math.max(
    0,
    decodedToken.exp * 1000 - Date.now()
  );

  res.cookie(env.JWT_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge
  });
};

export const register = async (req, res, next) => {
  try {
    const result = await registerOwner(req.body);

    setAuthCookie(res, result.token);

    res.status(201).json({
      success: true,
      message: "Owner registered successfully",
      owner: result.owner
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginOwner(req.body);

    setAuthCookie(res, result.token);

    res.status(200).json({
      success: true,
      message: "Login successful",
      owner: result.owner
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res) => {
  res.status(200).json({
    success: true,
    owner: getCurrentOwner(req.user)
  });
};

export const logout = (req, res) => {
  res.clearCookie(env.JWT_COOKIE_NAME, cookieOptions);

  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  });
};
