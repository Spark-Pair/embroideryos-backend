import express from "express";
import {
  createExpense,
  deleteExpense,
  getExpenses,
  getExpenseStats,
  updateExpense,
} from "../controllers/expense.controller.js";

const router = express.Router();

router.post("/", createExpense);
router.get("/", getExpenses);
router.get("/stats", getExpenseStats);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;
