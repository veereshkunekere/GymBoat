
import express from "express";
import { recordPayment,getOutstandingBalances,getPendingPayments,getPaymentHistory,getPaymentById,verifyPayment,rejectPayment } from "./payment.controller.js";

// Replace with the same authentication middleware
// used by your existing membership routes.
import protect from "../../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.post("/", recordPayment);
router.get("/history", getPaymentHistory);
router.get("/outstanding", getOutstandingBalances);
router.get("/pending", getPendingPayments);
router.get("/:paymentId", getPaymentById);

router.patch("/:paymentId/verify", verifyPayment);
router.patch("/:paymentId/reject", rejectPayment);
export default router;
