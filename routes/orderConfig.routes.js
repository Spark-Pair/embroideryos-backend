import express from "express";
import {
  getOrderConfig,
  createOrderConfig,
  updateOrderConfig,
} from "../controllers/orderConfig.controller.js";

const router = express.Router();

router.get("/", getOrderConfig);
router.post("/", createOrderConfig);
router.put("/", updateOrderConfig);

export default router;
