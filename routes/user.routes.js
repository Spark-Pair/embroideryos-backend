import express from "express";
import { getUsers, getUsersStats, getUser, toggleStatus, resetPassword, } from "../controllers/user.controller.js";

import allowedRoles from '../middlewares/role.js';

const router = express.Router();

// CRUD
router.get("/", allowedRoles(['developer']), getUsers);              // List (with user-wise access)
router.get("/stats", allowedRoles(['developer']), getUsersStats);              // List (with user-wise access)
router.get("/:id", getUser);             // Details
router.patch("/:id/toggle-status", allowedRoles(['developer']), toggleStatus); // Activate / Deactivate
router.patch("/:id/reset-password", allowedRoles(['developer']), resetPassword); // Activate / Deactivate

export default router;
