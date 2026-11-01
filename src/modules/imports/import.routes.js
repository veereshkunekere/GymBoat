import express from "express";

import authMiddleware from "../../middleware/auth.middleware.js";
import { resolveGym } from "../../middleware/gym.middleware.js";
import { uploadSingleFile } from "../../middleware/upload.middleware.js";
import * as controller from "./import.controller.js";

const router = express.Router();

router.use(authMiddleware, resolveGym);

router.get("/", controller.list);
router.post("/upload", uploadSingleFile, controller.upload);

router.get("/:jobId", controller.get);
router.post("/:jobId/preview", controller.preview);
router.post("/:jobId/commit", controller.commit);
router.post("/:jobId/undo", controller.undo);

export default router;
