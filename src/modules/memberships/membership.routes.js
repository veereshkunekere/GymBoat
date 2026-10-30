import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";

import * as controller from "./membership.controller.js";

import {
  validateAssignment,
  validateRenewal,
  validateMembershipId,
} from "./membership.validation.js";

const router = express.Router();

router.use(authMiddleware);

// Reusable validation middleware
const validateId = (req, res, next) => {
  if (!validateMembershipId(req.params.membershipId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid membership ID",
    });
  }

  next();
};

const handleValidation = (validator) => (
  req,
  res,
  next
) => {
  const errors = validator(req.body);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

// ASSIGN MEMBERSHIP
router.post(
  "/",
  handleValidation(validateAssignment),
  controller.assignMembership
);

// GET ALL MEMBERSHIPS
router.get("/", controller.getMemberships);

// GET MEMBERSHIP DETAILS
router.get(
  "/:membershipId",
  validateId,
  controller.getMembershipById
);

// RENEW
router.post(
  "/:membershipId/renew",
  validateId,
  handleValidation(validateRenewal),
  controller.renewMembership
);

// PAUSE
router.post(
  "/:membershipId/pause",
  validateId,
  controller.pauseMembership
);

// RESUME
router.post(
  "/:membershipId/resume",
  validateId,
  controller.resumeMembership
);

// CANCEL
router.post(
  "/:membershipId/cancel",
  validateId,
  controller.cancelMembership
);

export default router;