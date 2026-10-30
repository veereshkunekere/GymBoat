
import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";

import {
  addMember,
  getMembers,
  getMemberById,
  updateMember,
  archiveMember,
  restoreMember
} from "./member.controller.js";

const router = Router();

router.use(authMiddleware);

router.post("/", addMember);
router.get("/", getMembers);

router.get("/:memberId", getMemberById);
router.patch("/:memberId", updateMember);

router.patch("/:memberId/archive", archiveMember);
router.patch("/:memberId/restore", restoreMember);

export default router;
