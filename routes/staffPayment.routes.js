import express from "express";
import {
  createStaffPayment,
  getStaffPaymentMonths,
  getStaffPaymentStats,
  getStaffPayments,
} from "../controllers/staffPayment.controller.js";

const router = express.Router();

router.get("/stats", getStaffPaymentStats);
router.get("/months", getStaffPaymentMonths);
router.get("/", getStaffPayments);
router.post("/", createStaffPayment);

export default router;
