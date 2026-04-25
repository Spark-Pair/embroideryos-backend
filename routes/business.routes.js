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
  getMyMachineOptions,
  getMyReferenceData,
  updateMyMachineOptions,
  updateMyReferenceData,
  getMyRuleData,
  updateMyRuleData,
  getMyInvoiceCounter,
  updateMyInvoiceCounter,
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
router.get(
  "/me/machine-options",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  getMyMachineOptions
);
router.patch(
  "/me/machine-options",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  updateMyMachineOptions
);
router.get(
  "/me/reference-data",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  getMyReferenceData
);
router.patch(
  "/me/reference-data",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  updateMyReferenceData
);
router.get(
  "/me/rule-data",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  getMyRuleData
);
router.patch(
  "/me/rule-data",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  updateMyRuleData
);
router.get(
  "/me/invoice-counter",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  getMyInvoiceCounter
);
router.patch(
  "/me/invoice-counter",
  allowedRoles(['developer', 'admin', 'staff']),
  subscriptionMiddleware,
  updateMyInvoiceCounter
);
router.get("/:id", getBusiness);             // Details
router.put("/:id", allowedRoles(['developer']), updateBusiness);          // Edit
router.patch("/:id/toggle-status", allowedRoles(['developer']), toggleBusinessStatus); // Activate / Deactivate

export default router;
