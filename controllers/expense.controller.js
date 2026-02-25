import mongoose from "mongoose";
import Expense from "../models/Expense.js";
import Supplier from "../models/Supplier.js";

const EXPENSE_TYPES = new Set(["cash", "supplier", "fixed"]);

const toNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeText = (val) => (typeof val === "string" ? val.trim() : "");
const normalizeMonth = (value) => (typeof value === "string" ? value.trim() : "");

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

const parseDate = (date, month) => {
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    return new Date(`${month}-01T00:00:00.000Z`);
  }

  if (!date || Number.isNaN(new Date(date).getTime())) return null;
  return new Date(date);
};

export const createExpense = async (req, res) => {
  try {
    const {
      expense_type,
      supplier_id,
      date,
      month,
      reference_no,
      remarks,
      items,
      // backward compatibility
      title,
      amount,
      category,
      note,
    } = req.body;

    // Backward compatibility (old single-expense payload)
    if (!Array.isArray(items) && title) {
      const parsedAmount = toNum(amount);
      if (parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }

      const parsedDate = parseDate(date);
      if (!parsedDate) return res.status(400).json({ message: "Valid date is required" });

      const expense = await Expense.create({
        expense_type: "cash",
        item_name: normalizeText(title),
        amount: parsedAmount,
        date: parsedDate,
        month: parsedDate.toISOString().slice(0, 7),
        reference_no: normalizeText(category),
        remarks: normalizeText(note),
        group_key: new mongoose.Types.ObjectId().toString(),
        businessId: req.body.businessId,
      });

      return res.status(201).json({ success: true, data: [expense] });
    }

    if (!EXPENSE_TYPES.has(expense_type)) {
      return res.status(400).json({ message: "Invalid expense type" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one expense item is required" });
    }

    const normalizedMonth = normalizeMonth(month || String(date || "").slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedMonth)) {
      return res.status(400).json({ message: "Month must be in YYYY-MM format" });
    }

    const parsedDate = parseDate(date, expense_type === "fixed" ? normalizedMonth : null);
    if (!parsedDate) return res.status(400).json({ message: "Valid date/month is required" });

    const normalizedItems = items
      .map((row) => ({
        item_name: normalizeText(row?.item_name),
        amount: toNum(row?.amount),
      }))
      .filter((row) => row.item_name && row.amount > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: "At least one valid expense item is required" });
    }

    const businessFilter = buildBusinessFilter(req, req.body.businessId);
    const businessId = businessFilter.businessId || req.body.businessId;
    if (!businessId) return res.status(400).json({ message: "businessId is required" });

    let supplierName = "";
    let supplierObjectId = null;

    if (expense_type === "supplier") {
      if (!supplier_id || !mongoose.Types.ObjectId.isValid(supplier_id)) {
        return res.status(400).json({ message: "Valid supplier is required for supplier expense" });
      }

      const supplier = await Supplier.findOne({ _id: supplier_id, ...buildBusinessFilter(req, req.body.businessId) })
        .select("_id name")
        .lean();
      if (!supplier) return res.status(404).json({ message: "Supplier not found" });

      supplierObjectId = supplier._id;
      supplierName = supplier.name;
    }

    const groupKey = new mongoose.Types.ObjectId().toString();
    const docs = normalizedItems.map((row) => ({
      expense_type,
      item_name: row.item_name,
      amount: row.amount,
      date: parsedDate,
      month: normalizedMonth,
      reference_no: normalizeText(reference_no),
      remarks: normalizeText(remarks),
      supplier_id: supplierObjectId,
      supplier_name: supplierName,
      group_key: groupKey,
      businessId,
    }));

    const created = await Expense.insertMany(docs);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("createExpense:", err);
    return res.status(500).json({ message: "Failed to create expense" });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      title,
      item_name,
      expense_type,
      date_from,
      date_to,
      month,
      supplier_name,
      reference_no,
      businessId,
    } = req.query;

    const filter = {
      ...buildBusinessFilter(req, businessId),
    };

    const searchableItemName = item_name || title;
    if (searchableItemName?.trim()) {
      filter.item_name = { $regex: searchableItemName.trim(), $options: "i" };
    }

    if (expense_type && EXPENSE_TYPES.has(expense_type)) {
      filter.expense_type = expense_type;
    }

    if (supplier_name?.trim()) {
      filter.supplier_name = { $regex: supplier_name.trim(), $options: "i" };
    }

    if (reference_no?.trim()) {
      filter.reference_no = { $regex: reference_no.trim(), $options: "i" };
    }

    if (month?.trim()) {
      filter.month = month.trim();
    }

    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = new Date(date_from);
      if (date_to) filter.date.$lte = new Date(date_to);
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 30);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await Expense.countDocuments(filter);
    const data = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    return res.json({
      success: true,
      data,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        totalItems: total,
        itemsPerPage: parsedLimit,
      },
    });
  } catch (err) {
    console.error("getExpenses:", err);
    return res.status(500).json({ message: "Failed to fetch expenses" });
  }
};

export const getExpenseStats = async (req, res) => {
  try {
    const filter = buildBusinessFilter(req, req.query.businessId);

    const [stats] = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          total_amount: { $sum: "$amount" },
          cash_count: { $sum: { $cond: [{ $eq: ["$expense_type", "cash"] }, 1, 0] } },
          supplier_count: { $sum: { $cond: [{ $eq: ["$expense_type", "supplier"] }, 1, 0] } },
          fixed_count: { $sum: { $cond: [{ $eq: ["$expense_type", "fixed"] }, 1, 0] } },
        },
      },
    ]);

    return res.json({
      success: true,
      data: stats || {
        total: 0,
        total_amount: 0,
        cash_count: 0,
        supplier_count: 0,
        fixed_count: 0,
      },
    });
  } catch (err) {
    console.error("getExpenseStats:", err);
    return res.status(500).json({ message: "Failed to fetch expense stats" });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const { item_name, amount, date, reference_no, remarks } = req.body;

    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    if (item_name !== undefined) {
      const val = normalizeText(item_name);
      if (!val) return res.status(400).json({ message: "Item name is required" });
      expense.item_name = val;
    }

    if (amount !== undefined) {
      const parsedAmount = toNum(amount);
      if (parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be greater than 0" });
      }
      expense.amount = parsedAmount;
    }

    if (date !== undefined) {
      if (!date || Number.isNaN(new Date(date).getTime())) {
        return res.status(400).json({ message: "Valid date is required" });
      }
      expense.date = new Date(date);
      expense.month = String(date).slice(0, 7);
    }

    if (reference_no !== undefined) expense.reference_no = normalizeText(reference_no);
    if (remarks !== undefined) expense.remarks = normalizeText(remarks);

    await expense.save();
    return res.json({ success: true, data: expense });
  } catch (err) {
    console.error("updateExpense:", err);
    return res.status(500).json({ message: "Failed to update expense" });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    return res.json({ success: true, id: expense._id });
  } catch (err) {
    console.error("deleteExpense:", err);
    return res.status(500).json({ message: "Failed to delete expense" });
  }
};
