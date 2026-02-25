import express from "express";
import {
  createExpenseItem,
  getExpenseItems,
  toggleExpenseItemStatus,
  updateExpenseItem,
} from "../controllers/expenseItem.controller.js";

const router = express.Router();

router.post("/", createExpenseItem);
router.get("/", getExpenseItems);
router.put("/:id", updateExpenseItem);
router.patch("/:id/toggle-status", toggleExpenseItemStatus);

export default router;
