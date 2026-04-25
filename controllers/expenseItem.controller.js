import mongoose from "mongoose";
import ExpenseItem from "../models/ExpenseItem.js";
import Supplier from "../models/Supplier.js";
import { getBusinessRuleContextByBusinessId, getExpenseTypeRule } from "../utils/businessRuleData.js";

const toNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeText = (value) => String(value || "").trim();

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

    const normalizedName = normalizeText(name);
    if (!normalizedName) return res.status(400).json({ message: "Item name is required" });

    const businessFilter = buildBusinessFilter(req, req.body.businessId);
    const businessId = businessFilter.businessId || req.body.businessId;
    const ruleContext = await getBusinessRuleContextByBusinessId(businessId);
    const expenseRule = getExpenseTypeRule(ruleContext, expense_type);
    if (!expenseRule?.key) {
      return res.status(400).json({ message: "Invalid expense type" });
    }

    let supplierName = "";
    let supplierObjectId = null;
    let normalizedFixedSource = "";

    const normalizedExpenseType = expenseRule.is_fixed ? "fixed" : "cash";

    if (expenseRule.is_fixed) {
      normalizedFixedSource = expenseRule.requires_supplier ? "supplier" : "cash";

      if (expenseRule.requires_supplier) {
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
    } else {
      const existingRegularItem = await ExpenseItem.findOne({
        businessId,
        name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        $or: [
          { fixed_source: { $exists: false } },
          { fixed_source: "" },
        ],
      }).lean();
      if (existingRegularItem) {
        return res.status(400).json({ message: "Expense item already exists" });
      }
    }

    const qty = Math.max(0, toNum(default_quantity));
    const rate = Math.max(0, toNum(default_rate));
    const computedAmount = qty > 0 && rate > 0 ? qty * rate : Math.max(0, toNum(default_amount));

    const item = await ExpenseItem.create({
      name: normalizedName,
      expense_type: normalizedExpenseType,
      fixed_source: normalizedFixedSource,
      supplier_id: supplierObjectId,
      supplier_name: supplierName,
      default_quantity: qty,
      default_rate: rate,
      default_amount: computedAmount,
      businessId,
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

    if (expense_type?.trim()) filter.expense_type = expense_type.trim();
    if (fixed_source?.trim()) filter.fixed_source = fixed_source.trim();
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

    const businessFilter = buildBusinessFilter(req, req.body?.businessId || req.query?.businessId);
    const item = await ExpenseItem.findOne({ _id: req.params.id, ...businessFilter });
    if (!item) return res.status(404).json({ message: "Expense item not found" });

    if (name !== undefined) {
      const normalizedName = normalizeText(name);
      if (!normalizedName) return res.status(400).json({ message: "Item name is required" });

      if (!item.fixed_source) {
        const duplicateRegularItem = await ExpenseItem.findOne({
          _id: { $ne: item._id },
          businessId: item.businessId,
          name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          $or: [
            { fixed_source: { $exists: false } },
            { fixed_source: "" },
          ],
        }).lean();
        if (duplicateRegularItem) {
          return res.status(400).json({ message: "Expense item already exists" });
        }
      }

      item.name = normalizedName;
    }

    const nextExpenseType = expense_type !== undefined ? expense_type : item.expense_type;
    const businessId = item.businessId || businessFilter.businessId || req.body?.businessId;
    const ruleContext = await getBusinessRuleContextByBusinessId(businessId);
    const expenseRule = getExpenseTypeRule(ruleContext, nextExpenseType);
    if (!expenseRule?.key) {
      return res.status(400).json({ message: "Invalid expense type" });
    }
    if (expense_type !== undefined || !expenseRule.is_fixed) {
      item.expense_type = expenseRule.is_fixed ? "fixed" : "cash";
    }

    if (expenseRule.is_fixed) {
      const nextFixedSource = expenseRule.requires_supplier ? "supplier" : "cash";
      item.fixed_source = nextFixedSource;

      if (expenseRule.requires_supplier) {
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
    const businessFilter = buildBusinessFilter(req, req.body?.businessId || req.query?.businessId);
    const item = await ExpenseItem.findOne({ _id: req.params.id, ...businessFilter });
    if (!item) return res.status(404).json({ message: "Expense item not found" });

    item.isActive = !item.isActive;
    await item.save();

    return res.json({ success: true, id: item._id, isActive: item.isActive });
  } catch (err) {
    console.error("toggleExpenseItemStatus:", err);
    return res.status(500).json({ message: "Failed to toggle expense item status" });
  }
};
