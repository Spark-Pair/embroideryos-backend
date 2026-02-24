import express from "express";
import {
  createCustomerPayment,
  getCustomerPaymentMonths,
  getCustomerPayments,
  getCustomerPaymentStats,
} from "../controllers/customerPayment.controller.js";

const router = express.Router();

router.get("/stats", getCustomerPaymentStats);
router.get("/months", getCustomerPaymentMonths);
router.get("/", getCustomerPayments);
router.post("/", createCustomerPayment);

export default router;
