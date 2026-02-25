import express from "express";
import {
  createSupplier,
  getSupplier,
  getSuppliers,
  getSuppliersStats,
  toggleSupplierStatus,
  updateSupplier,
} from "../controllers/supplier.controller.js";

const router = express.Router();

router.post("/", createSupplier);
router.get("/", getSuppliers);
router.get("/stats", getSuppliersStats);
router.get("/:id", getSupplier);
router.put("/:id", updateSupplier);
router.patch("/:id/toggle-status", toggleSupplierStatus);

export default router;
