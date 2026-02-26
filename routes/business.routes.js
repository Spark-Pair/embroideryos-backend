import express from "express";
import {
  createBusiness,
  getBusinesses,
  getBusinessesStats,
  getBusiness,
  updateBusiness,
  toggleBusinessStatus,
  getMyInvoiceBanner,
  updateMyInvoiceBanner,
} from "../controllers/business.controller.js";

import allowedRoles from '../middlewares/role.js';
import { requireFeature } from "../middlewares/featureGate.js";
import subscriptionMiddleware from "../middlewares/subscription.js";

const router = express.Router();

// CRUD
router.post("/", allowedRoles(['developer']), createBusiness);             // Add
router.get("/", allowedRoles(['developer']), getBusinesses);              // List (with business-wise access)
router.get("/stats", allowedRoles(['developer']), getBusinessesStats);              // List (with business-wise access)
router.get(
  "/me/invoice-banner",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  getMyInvoiceBanner
);
router.patch(
  "/me/invoice-banner",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  requireFeature("invoice_banner"),
  updateMyInvoiceBanner
);
router.get("/:id", getBusiness);             // Details
router.put("/:id", allowedRoles(['developer']), updateBusiness);          // Edit
router.patch("/:id/toggle-status", allowedRoles(['developer']), toggleBusinessStatus); // Activate / Deactivate

export default router;
