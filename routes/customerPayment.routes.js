import express from "express";
import {
  createCustomerPayment,
  getCustomerStatement,
  getCustomerPaymentMonths,
  getCustomerPayments,
  getCustomerPaymentStats,
  updateCustomerPayment,
} from "../controllers/customerPayment.controller.js";

const router = express.Router();

router.get("/stats", getCustomerPaymentStats);
router.get("/months", getCustomerPaymentMonths);
router.get("/statement", getCustomerStatement);
router.get("/", getCustomerPayments);
router.post("/", createCustomerPayment);
router.put("/:id", updateCustomerPayment);

export default router;
