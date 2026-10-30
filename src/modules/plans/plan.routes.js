import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";

import {
  createPlan,
  getPlans,
  getPlanById,
  updatePlan,
  updatePlanStatus,
} from "./plan.controller.js";

import { validatePlan } from "./plan.validation.js";

const router = express.Router();

router.use(authMiddleware);

// CREATE
router.post("/", (req, res, next) => {
  const errors = validatePlan(req.body);

  if (Object.keys(errors).length) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
}, createPlan);

// READ
router.get("/", getPlans);
router.get("/:planId", getPlanById);

// UPDATE
router.patch("/:planId", (req, res, next) => {
  const errors = validatePlan(req.body, true);

  if (Object.keys(errors).length) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  if (!Object.keys(req.body).length) {
    return res.status(400).json({
      success: false,
      message: "At least one field is required",
    });
  }

  next();
}, updatePlan);

// ACTIVATE / DEACTIVATE
router.patch("/:planId/status", (req, res, next) => {
  if (typeof req.body.isActive !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isActive must be a boolean",
    });
  }

  next();
}, updatePlanStatus);

export default router;