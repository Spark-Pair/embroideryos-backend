import express from "express";
import { createBusiness, getBusinesses, getBusinessesStats, getBusiness, updateBusiness, toggleBusinessStatus, } from "../controllers/business.controller.js";

import allowedRoles from '../middlewares/role.js';

const router = express.Router();

// CRUD
router.post("/", allowedRoles(['developer']), createBusiness);             // Add
router.get("/", allowedRoles(['developer']), getBusinesses);              // List (with business-wise access)
router.get("/stats", allowedRoles(['developer']), getBusinessesStats);              // List (with business-wise access)
router.get("/:id", getBusiness);             // Details
router.put("/:id", allowedRoles(['developer']), updateBusiness);          // Edit
router.patch("/:id/toggle-status", allowedRoles(['developer']), toggleBusinessStatus); // Activate / Deactivate

export default router;
