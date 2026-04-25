import express from "express";
import {
  getUsers,
  getUsersStats,
  getLoggedInUsers,
  getUser,
  logoutUserEverywhere,
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
// Business users (access-rule aware, plan-aware)
router.get("/business", subscriptionMiddleware, allowedRoles(["admin"], { accessKey: "users_manage" }), getBusinessUsers);
router.get("/business/stats", subscriptionMiddleware, allowedRoles(["admin"], { accessKey: "users_manage" }), getBusinessUsersStats);
router.post("/business", subscriptionMiddleware, allowedRoles(["admin"], { accessKey: "users_manage" }), createBusinessUser);
router.patch("/business/:id/toggle-status", subscriptionMiddleware, allowedRoles(["admin"], { accessKey: "users_manage" }), toggleBusinessUserStatus);
router.patch("/business/:id/reset-password", subscriptionMiddleware, allowedRoles(["admin"], { accessKey: "users_manage" }), resetBusinessUserPassword);

// Developer-only users
router.get("/", allowedRoles(["developer"]), getUsers);
router.get("/stats", allowedRoles(["developer"]), getUsersStats);
router.get("/active-sessions", allowedRoles(["developer"]), getLoggedInUsers);
router.delete("/:id/active-sessions", allowedRoles(["developer"]), logoutUserEverywhere);
router.get("/:id", allowedRoles(["developer"]), getUser);
router.patch("/:id/toggle-status", allowedRoles(["developer"]), toggleStatus);
router.patch("/:id/reset-password", allowedRoles(["developer"]), resetPassword);

export default router;
