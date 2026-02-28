import express from "express";
import {
  createSupplierPayment,
  getSupplierStatement,
  getSupplierPaymentMonths,
  getSupplierPayments,
  getSupplierPaymentStats,
} from "../controllers/supplierPayment.controller.js";

const router = express.Router();

router.get("/stats", getSupplierPaymentStats);
router.get("/months", getSupplierPaymentMonths);
router.get("/statement", getSupplierStatement);
router.get("/", getSupplierPayments);
router.post("/", createSupplierPayment);

export default router;
