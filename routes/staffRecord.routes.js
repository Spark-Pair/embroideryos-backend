import express from "express";
import { createStaff, getStaffs, getStaffsStats, getStaff, updateStaff, toggleStaffStatus, } from "../controllers/staff.controller.js";

const router = express.Router();

// CRUD
router.post("/", createStaff);             // Add
router.get("/", getStaffs);              // List (with staff-wise access)
router.get("/stats", getStaffsStats);              // List (with staff-wise access)
router.get("/:id", getStaff);             // Details
router.put("/:id", updateStaff);          // Edit
router.patch("/:id/toggle-status", toggleStaffStatus); // Activate / Deactivate

export default router;
