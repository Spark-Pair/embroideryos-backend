import express from "express";
import {
  getPlans,
  getMySubscription,
  listSubscriptions,
  updateSubscription,
} from "../controllers/subscription.controller.js";
import allowedRoles from "../middlewares/role.js";

const router = express.Router();

router.get("/plans", allowedRoles(["developer", "admin", "staff"]), getPlans);
router.get("/me", allowedRoles(["developer", "admin", "staff"]), getMySubscription);
router.get("/", allowedRoles(["developer"]), listSubscriptions);
router.patch("/:id", allowedRoles(["developer"]), updateSubscription);

export default router;
