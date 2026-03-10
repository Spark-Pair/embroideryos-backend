import express from "express";
import {
  getUsers,
  getUsersStats,
  getUser,
  toggleStatus,
  resetPassword,
  getBusinessUsers,
  getBusinessUsersStats,
  createBusinessUser,
  toggleBusinessUserStatus,
  resetBusinessUserPassword,
} from "../controllers/user.controller.js";

import allowedRoles from "../middlewares/role.js";
import subscriptionMiddleware from "../middlewares/subscription.js";

const router = express.Router();

// CRUD
// Business users (admin only, plan-aware)
router.get("/business", subscriptionMiddleware, allowedRoles(["admin"]), getBusinessUsers);
router.get("/business/stats", subscriptionMiddleware, allowedRoles(["admin"]), getBusinessUsersStats);
router.post("/business", subscriptionMiddleware, allowedRoles(["admin"]), createBusinessUser);
router.patch("/business/:id/toggle-status", subscriptionMiddleware, allowedRoles(["admin"]), toggleBusinessUserStatus);
router.patch("/business/:id/reset-password", subscriptionMiddleware, allowedRoles(["admin"]), resetBusinessUserPassword);

// Developer-only users
router.get("/", allowedRoles(["developer"]), getUsers);
router.get("/stats", allowedRoles(["developer"]), getUsersStats);
router.get("/:id", allowedRoles(["developer"]), getUser);
router.patch("/:id/toggle-status", allowedRoles(["developer"]), toggleStatus);
router.patch("/:id/reset-password", allowedRoles(["developer"]), resetPassword);

export default router;
