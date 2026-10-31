
import { Router } from "express";
import { getDashboard } from "./dashboard.controller.js";
import authMiddleware from "../../middleware/auth.middleware.js";
const router = Router();
router.use(authMiddleware);

router.get("/", getDashboard);

export default router;
