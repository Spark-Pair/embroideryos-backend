import express from "express";
import {
  createOrder,
  getOrder,
  getOrders,
  getOrderStats,
  toggleOrderStatus,
  updateOrder,
} from "../controllers/order.controller.js";

const router = express.Router();

router.get("/stats", getOrderStats);
router.get("/", getOrders);
router.get("/:id", getOrder);
router.post("/", createOrder);
router.put("/:id", updateOrder);
router.patch("/:id/toggle-status", toggleOrderStatus);

export default router;
