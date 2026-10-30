
import express from "express";

import {
  register,
  login,
  me,
  logout
} from "./auth.controller.js";

import {
  registerSchema,
  loginSchema
} from "./auth.validation.js";

import { validate } from "../../middleware/validate.middleware.js";
import  authenticateOwner  from  "../../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

// Protected routes
router.get("/me", authenticateOwner, me);

// Logout
router.post("/logout", logout);

export default router;
