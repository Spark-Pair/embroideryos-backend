import express from "express";
import allowedRoles from "../middlewares/role.js";
import {
  createSubscriptionPayment,
  getSubscriptionPaymentStats,
  getSubscriptionPayments,
  updateSubscriptionPayment,
} from "../controllers/subscriptionPayment.controller.js";

const router = express.Router();

router.get("/", allowedRoles(["developer"]), getSubscriptionPayments);
router.get("/stats", allowedRoles(["developer"]), getSubscriptionPaymentStats);
router.post("/", allowedRoles(["developer"]), createSubscriptionPayment);
router.put("/:id", allowedRoles(["developer"]), updateSubscriptionPayment);

export default router;
