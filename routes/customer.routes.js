import express from "express";
import { createCustomer, getCustomers, getCustomersStats, getCustomer, updateCustomer, toggleCustomerStatus, } from "../controllers/customer.controller.js";

const router = express.Router();

// CRUD
router.post("/", createCustomer);             // Add
router.get("/", getCustomers);              // List (with customer-wise access)
router.get("/stats", getCustomersStats);              // List (with customer-wise access)
router.get("/:id", getCustomer);             // Details
router.put("/:id", updateCustomer);          // Edit
router.patch("/:id/toggle-status", toggleCustomerStatus); // Activate / Deactivate

export default router;
