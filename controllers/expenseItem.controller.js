import mongoose from "mongoose";
import ExpenseItem from "../models/ExpenseItem.js";
import Supplier from "../models/Supplier.js";

const EXPENSE_TYPES = new Set(["general", "cash", "supplier", "fixed"]);
const FIXED_SOURCES = new Set(["cash", "supplier"]);

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
    const {
      name,
      expense_type,
      fixed_source,
      supplier_id,
      default_quantity,
      default_rate,
      default_amount,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Item name is required" });
    if (!EXPENSE_TYPES.has(expense_type)) {
      return res.status(400).json({ message: "Invalid expense type" });
    }

    let supplierName = "";
    let supplierObjectId = null;
    let normalizedFixedSource = "";

    if (expense_type === "fixed") {
      if (!FIXED_SOURCES.has(fixed_source)) {
        return res.status(400).json({ message: "Fixed source must be cash or supplier" });
      }
      normalizedFixedSource = fixed_source;

      if (fixed_source === "supplier") {
        if (!supplier_id || !mongoose.Types.ObjectId.isValid(supplier_id)) {
          return res.status(400).json({ message: "Valid supplier is required for supplier fixed expense" });
        }

        const supplier = await Supplier.findOne({
          _id: supplier_id,
          ...buildBusinessFilter(req, req.body.businessId),
        }).select("_id name").lean();

        if (!supplier) return res.status(404).json({ message: "Supplier not found" });

        supplierObjectId = supplier._id;
        supplierName = supplier.name;
      }
    }

    const qty = Math.max(0, toNum(default_quantity));
    const rate = Math.max(0, toNum(default_rate));
    const computedAmount = qty > 0 && rate > 0 ? qty * rate : Math.max(0, toNum(default_amount));

    const item = await ExpenseItem.create({
      name: name.trim(),
      expense_type,
      fixed_source: normalizedFixedSource,
      supplier_id: supplierObjectId,
      supplier_name: supplierName,
      default_quantity: qty,
      default_rate: rate,
      default_amount: computedAmount,
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
    const { expense_type, fixed_source, supplier_id, status, name, businessId } = req.query;

    const filter = { ...buildBusinessFilter(req, businessId) };

    if (expense_type && EXPENSE_TYPES.has(expense_type)) filter.expense_type = expense_type;
    if (fixed_source && FIXED_SOURCES.has(fixed_source)) filter.fixed_source = fixed_source;
    if (supplier_id && mongoose.Types.ObjectId.isValid(supplier_id)) filter.supplier_id = new mongoose.Types.ObjectId(supplier_id);
    if (supplier_id === "cash") filter.supplier_id = null;
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
    const {
      name,
      expense_type,
      fixed_source,
      supplier_id,
      default_quantity,
      default_rate,
      default_amount,
    } = req.body;

    const item = await ExpenseItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Expense item not found" });

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Item name is required" });
      item.name = String(name).trim();
    }

    const nextExpenseType = expense_type !== undefined ? expense_type : item.expense_type;
    if (expense_type !== undefined && !EXPENSE_TYPES.has(expense_type)) {
      return res.status(400).json({ message: "Invalid expense type" });
    }
    if (expense_type !== undefined) {
      item.expense_type = expense_type;
    }

    if (nextExpenseType === "fixed") {
      const nextFixedSource = fixed_source !== undefined ? fixed_source : item.fixed_source;
      if (!FIXED_SOURCES.has(nextFixedSource)) {
        return res.status(400).json({ message: "Fixed source must be cash or supplier" });
      }
      item.fixed_source = nextFixedSource;

      if (nextFixedSource === "supplier") {
        const nextSupplierId = supplier_id !== undefined ? supplier_id : item.supplier_id;
        if (!nextSupplierId || !mongoose.Types.ObjectId.isValid(nextSupplierId)) {
          return res.status(400).json({ message: "Valid supplier is required for supplier fixed expense" });
        }

        const supplier = await Supplier.findOne({
          _id: nextSupplierId,
          ...buildBusinessFilter(req, req.body.businessId),
        }).select("_id name").lean();
        if (!supplier) return res.status(404).json({ message: "Supplier not found" });

        item.supplier_id = supplier._id;
        item.supplier_name = supplier.name;
      } else {
        item.supplier_id = null;
        item.supplier_name = "";
      }
    } else {
      item.fixed_source = "";
      item.supplier_id = null;
      item.supplier_name = "";
    }

    if (default_quantity !== undefined) {
      item.default_quantity = Math.max(0, toNum(default_quantity));
    }

    if (default_rate !== undefined) {
      item.default_rate = Math.max(0, toNum(default_rate));
    }

    if (default_amount !== undefined) {
      item.default_amount = Math.max(0, toNum(default_amount));
    }

    const recomputed = toNum(item.default_quantity) * toNum(item.default_rate);
    if (recomputed > 0) {
      item.default_amount = recomputed;
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
