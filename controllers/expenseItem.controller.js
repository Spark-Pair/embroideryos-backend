import mongoose from "mongoose";
import ExpenseItem from "../models/ExpenseItem.js";

const EXPENSE_TYPES = new Set(["cash", "supplier", "fixed"]);

const toNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const buildBusinessFilter = (req, businessId) => {
  if (req.user?.role !== "developer") {
    return req.user?.businessId
      ? { businessId: new mongoose.Types.ObjectId(req.user.businessId) }
      : {};
  }

  if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
    return { businessId: new mongoose.Types.ObjectId(businessId) };
  }

  return {};
};

export const createExpenseItem = async (req, res) => {
  try {
    const { name, expense_type, default_amount } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Item name is required" });
    if (!EXPENSE_TYPES.has(expense_type)) {
      return res.status(400).json({ message: "Invalid expense type" });
    }

    const item = await ExpenseItem.create({
      name: name.trim(),
      expense_type,
      default_amount: Math.max(0, toNum(default_amount)),
      businessId: req.body.businessId,
    });

    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error("createExpenseItem:", err);
    return res.status(500).json({ message: "Failed to create expense item" });
  }
};

export const getExpenseItems = async (req, res) => {
  try {
    const { expense_type, status, name, businessId } = req.query;

    const filter = { ...buildBusinessFilter(req, businessId) };

    if (expense_type && EXPENSE_TYPES.has(expense_type)) filter.expense_type = expense_type;
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (name?.trim()) filter.name = { $regex: name.trim(), $options: "i" };

    const data = await ExpenseItem.find(filter).sort({ expense_type: 1, name: 1 }).lean();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getExpenseItems:", err);
    return res.status(500).json({ message: "Failed to fetch expense items" });
  }
};

export const updateExpenseItem = async (req, res) => {
  try {
    const { name, expense_type, default_amount } = req.body;

    const item = await ExpenseItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Expense item not found" });

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Item name is required" });
      item.name = String(name).trim();
    }

    if (expense_type !== undefined) {
      if (!EXPENSE_TYPES.has(expense_type)) {
        return res.status(400).json({ message: "Invalid expense type" });
      }
      item.expense_type = expense_type;
    }

    if (default_amount !== undefined) {
      item.default_amount = Math.max(0, toNum(default_amount));
    }

    await item.save();
    return res.json({ success: true, data: item });
  } catch (err) {
    console.error("updateExpenseItem:", err);
    return res.status(500).json({ message: "Failed to update expense item" });
  }
};

export const toggleExpenseItemStatus = async (req, res) => {
  try {
    const item = await ExpenseItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Expense item not found" });

    item.isActive = !item.isActive;
    await item.save();

    return res.json({ success: true, id: item._id, isActive: item.isActive });
  } catch (err) {
    console.error("toggleExpenseItemStatus:", err);
    return res.status(500).json({ message: "Failed to toggle expense item status" });
  }
};
