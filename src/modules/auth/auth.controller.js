
import {
  registerOwner,
  loginOwner,
  getCurrentOwner
} from "./auth.service.js";

import { env } from "../../config/env.js";

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: "/"
};

const setAuthCookie = (res, token) => {
  res.cookie(env.JWT_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: 24 * 60 * 60 * 1000
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
