import express from "express";
import {
  createPlan,
  createSubscription,
  getPlans,
  getMySubscription,
  listSubscriptions,
  renewSubscription,
  updatePlan,
  updateSubscription,
} from "../controllers/subscription.controller.js";
import allowedRoles from "../middlewares/role.js";

const router = express.Router();

router.get("/plans", allowedRoles(["developer", "admin", "staff"]), getPlans);
router.post("/plans", allowedRoles(["developer"]), createPlan);
router.put("/plans/:id", allowedRoles(["developer"]), updatePlan);
router.get("/me", allowedRoles(["developer", "admin", "staff"]), getMySubscription);
router.get("/", allowedRoles(["developer"]), listSubscriptions);
router.post("/", allowedRoles(["developer"]), createSubscription);
router.patch("/:id", allowedRoles(["developer"]), updateSubscription);
router.post("/:id/renew", allowedRoles(["developer"]), renewSubscription);

export default router;
